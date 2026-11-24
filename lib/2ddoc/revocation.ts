import { verify, type X509Certificate } from 'node:crypto'

import { enfants, entierHexa, instant, lireTout, OID, SEQUENCE, type Noeud } from './der.ts'

/**
 * Revocation du certificat d'un emetteur de 2D-Doc.
 *
 * Le certificat nomme lui-meme l'adresse de la liste de revocation de son
 * autorite (point de distribution). La liste telechargee n'a pas a etre crue :
 * elle n'est retenue que si elle est signee par l'autorite epinglee, emise au
 * nom de cette autorite, complete et encore en cours de validite.
 *
 * Trois etats. « non revoque » : une liste valable a ete lue et ne cite pas le
 * certificat. « revoque » : elle le cite, quels que soient la date et le motif.
 * « inconnu » : tout le reste (pas de point de distribution, liste
 * injoignable, perimee, partielle, signee par une autre cle, certificat
 * arrive a echeance et donc sorti des listes). Seul « non revoque » permet de
 * dire « authentique » : ce qui n'a pas pu etre consulte n'est pas etabli.
 *
 * La demande est la meme pour tous les certificats d'une autorite : elle ne
 * nomme ni le certificat, ni le document, ni la personne.
 */

export type EtatRevocation = 'non_revoque' | 'revoque' | 'inconnu'

/** Telecharge au plus `maximum` octets. Remplacable dans les essais. */
export type Telechargement = (adresse: string, maximum?: number) => Promise<Buffer | null>

const LISTE_MAX = 2 * 1024 * 1024
const POINTS_MAX = 3
const DUREE_SUCCES = 3_600_000
const DUREE_ECHEC = 10 * 60_000
const ENTREES_MAX = 16
/** Tolerance d'horloge sur la date d'emission d'une liste. */
const AVANCE = 5 * 60_000

const POINTS_DE_DISTRIBUTION = '551d1f'
const LISTE_PARTIELLE = '551d1c'
const LISTE_DELTA = '551d1b'

const ALGORITHMES: Readonly<Record<string, { condensat: string; cle: string }>> = {
  '2a864886f70d01010b': { condensat: 'sha256', cle: 'rsa' },
  '2a864886f70d01010c': { condensat: 'sha384', cle: 'rsa' },
  '2a864886f70d01010d': { condensat: 'sha512', cle: 'rsa' },
  '2a8648ce3d040302': { condensat: 'sha256', cle: 'ec' },
  '2a8648ce3d040303': { condensat: 'sha384', cle: 'ec' },
  '2a8648ce3d040304': { condensat: 'sha512', cle: 'ec' },
}

type Liste = { emetteur: Buffer; emise: number; prochaine: number; revoques: ReadonlySet<string> }

const memoire = new Map<string, { liste: Liste | null; jusque: number }>()

/** Vide la memoire des listes : essais uniquement. */
export function oublierListes() {
  memoire.clear()
}

/** Les champs du certificat que `node:crypto` ne rend pas tels quels. */
function champsDuCertificat(certificat: X509Certificate) {
  const champs = enfants(enfants(lireTout(certificat.raw))[0]!)
  const decalage = champs[0]!.etiquette === 0xa0 ? 1 : 0
  return {
    numero: entierHexa(champs[decalage]!),
    emetteur: champs[decalage + 2]!.brut,
    extensions: champs.find((champ) => champ.etiquette === 0xa3),
  }
}

/** Valeur de l'extension `oid`, parmi une suite d'extensions. */
function extension(suite: Noeud, oid: string) {
  for (const element of enfants(suite)) {
    const parties = enfants(element)
    if (parties[0]?.etiquette === OID && parties[0].contenu.toString('hex') === oid)
      return lireTout(parties.at(-1)!.contenu)
  }
  return null
}

function adresseSure(texte: string) {
  try {
    const adresse = new URL(texte)
    if (adresse.protocol !== 'http:' && adresse.protocol !== 'https:') return null
    if (adresse.username || adresse.password || adresse.port) return null
    // Un nom de domaine public, jamais une adresse numerique ni un nom local.
    if (!/^(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/.test(adresse.hostname)) return null
    return adresse.href
  } catch {
    return null
  }
}

/**
 * Adresses des listes completes nommees par le certificat. Un point limite a
 * certains motifs, ou tenu par un autre emetteur, est ignore.
 */
export function pointsDeDistribution(certificat: X509Certificate): string[] {
  try {
    const { extensions } = champsDuCertificat(certificat)
    const points = extensions && extension(enfants(extensions)[0]!, POINTS_DE_DISTRIBUTION)
    if (!points) return []
    const adresses: string[] = []
    for (const point of enfants(points)) {
      const parties = enfants(point)
      if (parties.some((partie) => partie.etiquette !== 0xa0)) continue
      const nom = parties[0] && enfants(parties[0])[0]
      if (nom?.etiquette !== 0xa0) continue
      for (const general of enfants(nom)) {
        const adresse =
          general.etiquette === 0x86 && adresseSure(general.contenu.toString('latin1'))
        if (adresse && !adresses.includes(adresse)) adresses.push(adresse)
      }
    }
    return adresses.slice(0, POINTS_MAX)
  } catch {
    return []
  }
}

/** La liste, si elle est signee par l'autorite et couvre tous ses certificats. */
function lireListe(octets: Buffer, autorite: X509Certificate): Liste | null {
  try {
    const texte = octets.subarray(0, 64).toString('latin1')
    const der = texte.includes('-----BEGIN X509 CRL-----')
      ? Buffer.from(
          octets
            .toString('latin1')
            .replace(/-----(BEGIN|END) X509 CRL-----/g, '')
            .replace(/\s+/g, ''),
          'base64',
        )
      : octets
    const [corps, algorithme, signature, ...reste] = enfants(lireTout(der))
    if (!corps || !algorithme || !signature || reste.length) return null
    if (signature.etiquette !== 0x03 || signature.contenu[0] !== 0) return null
    const choix = ALGORITHMES[enfants(algorithme)[0]!.contenu.toString('hex')]
    const cle = autorite.publicKey
    if (!choix || cle.asymmetricKeyType !== choix.cle) return null
    if (!verify(choix.condensat, corps.brut, cle, signature.contenu.subarray(1))) return null

    const champs = enfants(corps)
    let i = champs[0]?.etiquette === 0x02 ? 1 : 0
    if (!champs[i++]?.brut.equals(algorithme.brut)) return null
    const emetteur = champs[i++]!.brut
    const emise = instant(champs[i++]!)
    // Sans date de prochaine emission, rien ne dit que la liste est a jour.
    const prochaine = instant(champs[i++]!)
    const revoques = new Set<string>()
    if (champs[i]?.etiquette === SEQUENCE)
      for (const entree of enfants(champs[i++]!)) revoques.add(entierHexa(enfants(entree)[0]!))
    const extensions = champs[i]?.etiquette === 0xa0 ? enfants(champs[i++]!)[0] : undefined
    if (i !== champs.length) return null
    for (const element of extensions ? enfants(extensions) : []) {
      const parties = enfants(element)
      const oid = parties[0]!.contenu.toString('hex')
      const critique = parties.length === 3 && parties[1]!.contenu[0] !== 0
      if (oid === LISTE_DELTA) return null
      if (oid === LISTE_PARTIELLE) {
        // Seule la restriction « certificats d'utilisateurs » nous couvre.
        const limites = enfants(lireTout(parties.at(-1)!.contenu))
        if (limites.some((limite) => limite.etiquette !== 0xa0 && limite.etiquette !== 0x81))
          return null
      } else if (critique) return null
    }
    return { emetteur, emise, prochaine, revoques }
  } catch {
    return null
  }
}

async function listeDe(
  adresse: string,
  autorite: X509Certificate,
  telecharger: Telechargement,
): Promise<Liste | null> {
  const cle = `${autorite.fingerprint256} ${adresse}`
  const instantReel = Date.now()
  let entree = memoire.get(cle)
  if (!entree || entree.jusque < instantReel) {
    const recu = await telecharger(adresse, LISTE_MAX)
    const liste = recu && lireListe(recu, autorite)
    entree = {
      liste: liste || null,
      jusque: instantReel + (liste ? DUREE_SUCCES : DUREE_ECHEC),
    }
    if (memoire.size >= ENTREES_MAX) memoire.clear()
    memoire.set(cle, entree)
  }
  return entree.liste
}

/**
 * Consulte la revocation de `certificat`, emis par `autorite`.
 *
 * La premiere liste valable decide. `journal` recoit le detail, pour la
 * recette en ligne de commande uniquement.
 */
export async function consulterRevocation(
  certificat: X509Certificate,
  autorite: X509Certificate,
  options: { telecharger: Telechargement; maintenant?: Date; journal?: (ligne: string) => void },
): Promise<EtatRevocation> {
  const maintenant = (options.maintenant ?? new Date()).getTime()
  const dire = options.journal ?? (() => {})
  let champs: ReturnType<typeof champsDuCertificat>
  try {
    champs = champsDuCertificat(certificat)
  } catch {
    return 'inconnu'
  }
  // Un certificat arrive a echeance sort des listes : sa revocation ne se lit plus.
  if (new Date(certificat.validTo).getTime() < maintenant) {
    dire('Revocation : certificat arrive a echeance, les listes ne le couvrent plus')
    return 'inconnu'
  }
  const adresses = pointsDeDistribution(certificat)
  if (!adresses.length) dire('Revocation : le certificat ne nomme aucune liste exploitable')
  for (const adresse of adresses) {
    const liste = await listeDe(adresse, autorite, options.telecharger)
    if (!liste) {
      dire(`Revocation : ${adresse} injoignable ou liste non retenue`)
      continue
    }
    if (!liste.emetteur.equals(champs.emetteur)) {
      dire(`Revocation : ${adresse} est la liste d'un autre emetteur`)
      continue
    }
    if (liste.emise > maintenant + AVANCE || liste.prochaine < maintenant) {
      dire(`Revocation : ${adresse} rend une liste hors de sa periode de validite`)
      continue
    }
    const revoque = liste.revoques.has(champs.numero)
    dire(
      `Revocation : liste du ${new Date(liste.emise).toISOString().slice(0, 10)} lue a ${adresse}, certificat ${revoque ? 'REVOQUE' : 'non revoque'}`,
    )
    return revoque ? 'revoque' : 'non_revoque'
  }
  return 'inconnu'
}
