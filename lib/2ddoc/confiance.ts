import { X509Certificate } from 'node:crypto'

import { AUTORITES, type Autorite } from './autorites.ts'
import type { Telechargement } from './revocation.ts'

export type { Telechargement } from './revocation.ts'

/**
 * D'ou vient la cle qui verifie un 2D-Doc.
 *
 * L'en-tete du code nomme une autorite (FR01, FR04...) et un certificat
 * d'emetteur. Les autorites sont epinglees dans `autorites.ts`, d'apres la
 * liste de confiance de l'ANTS. Le certificat de l'emetteur, lui, se telecharge
 * chez l'autorite, a l'une des adresses de `recherches`.
 *
 * Ce telechargement n'a pas a etre cru : un certificat recu n'est retenu que
 * s'il est signe par l'autorite epinglee, n'est pas lui-meme une autorite,
 * porte une cle elliptique et est valide au jour de signature du document.
 * Quand la reponse contient plusieurs certificats (annuaire, recherche),
 * seuls ceux dont le nom est l'identifiant demande sont gardes. Une adresse
 * fausse, une reponse substituee ou une panne donnent toutes la meme chose :
 * pas de cle, donc « non verifiable ».
 *
 * Seul l'identifiant du certificat (quatre caracteres) part vers l'autorite.
 * Aucune donnee du document ni de la personne.
 */

export type Emetteur = {
  certificat: X509Certificate
  autorite: X509Certificate
  organisation: string
}

const CERTIFICAT_MAX = 64 * 1024
const ANNUAIRE_MAX = 4 * 1024 * 1024
const DELAI = 4000
const DUREE_SUCCES = 24 * 3_600_000
const DUREE_ECHEC = 10 * 60_000
const ENTREES_MAX = 64
/** Certificats lus dans une reponse, et gardes pour un identifiant. */
const LECTURES_MAX = 5000
const HOMONYMES_MAX = 4

const memoire = new Map<string, { certificats: Buffer[]; jusque: number }>()

/** Vide la memoire des certificats : essais uniquement. */
export function oublierCertificats() {
  memoire.clear()
}

export const telecharger: Telechargement = async (adresse, maximum = CERTIFICAT_MAX) => {
  try {
    const reponse = await fetch(adresse, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI),
    })
    if (!reponse.ok || !reponse.body) return null
    const annonce = Number(reponse.headers.get('content-length') ?? 0)
    if (annonce > maximum) return null
    const blocs: Buffer[] = []
    let taille = 0
    for await (const bloc of reponse.body) {
      taille += bloc.length
      if (taille > maximum) return null
      blocs.push(Buffer.from(bloc))
    }
    return taille ? Buffer.concat(blocs) : null
  } catch {
    return null
  }
}

/**
 * Les certificats presents dans une reponse, quelle que soit son enveloppe :
 * DER seul, PEM, suite de certificats, message en plusieurs parties.
 *
 * Rien n'est cru ici : chaque certificat trouve passe ensuite par
 * `chaineValide`. Un faux positif ne peut donc que ne pas etre retenu.
 */
export function certificatsDans(octets: Buffer): X509Certificate[] {
  const trouves: X509Certificate[] = []
  let lectures = 0
  const lire = (der: Buffer) => {
    if (lectures++ >= LECTURES_MAX) return false
    try {
      trouves.push(new X509Certificate(der))
      return true
    } catch {
      return false
    }
  }
  const texte = octets.toString('latin1')
  for (const [, base64] of texte.matchAll(
    /-----BEGIN CERTIFICATE-----([A-Za-z0-9+/=\s]+)-----END CERTIFICATE-----/g,
  ))
    lire(Buffer.from(base64!, 'base64'))
  // Un certificat DER : une sequence longue qui commence par une sequence longue.
  let i = 0
  while ((i = octets.indexOf(0x30, i)) !== -1 && i + 8 <= octets.length) {
    const fin = i + 4 + octets.readUInt16BE(i + 2)
    if (
      octets[i + 1] === 0x82 &&
      octets[i + 4] === 0x30 &&
      octets[i + 5] === 0x82 &&
      fin <= octets.length &&
      lire(octets.subarray(i, fin))
    )
      i = fin
    else i += 1
  }
  return trouves
}

function valideLe(certificat: X509Certificate, jour: Date) {
  // Le jour de signature est connu a la journee pres.
  return (
    new Date(certificat.validFrom).getTime() <= jour.getTime() + 86_400_000 &&
    new Date(certificat.validTo).getTime() >= jour.getTime()
  )
}

function sujet(certificat: X509Certificate) {
  return new Map(
    certificat.subject.split('\n').map((ligne) => {
      const egal = ligne.indexOf('=')
      return [ligne.slice(0, egal), ligne.slice(egal + 1)] as const
    }),
  )
}

function organisation(certificat: X509Certificate) {
  const champs = sujet(certificat)
  const nom = (champs.get('O') ?? champs.get('CN') ?? '').replace(/[^\p{L}\p{N} .,'&()/-]/gu, '')
  return nom.trim().slice(0, 80)
}

/** Le certificat, s'il est signe par l'autorite, n'en est pas une et porte une cle elliptique. */
function chaineValide(certificat: X509Certificate, autorite: X509Certificate) {
  try {
    return (
      !certificat.ca &&
      certificat.checkIssued(autorite) &&
      certificat.verify(autorite.publicKey) &&
      certificat.publicKey.asymmetricKeyType === 'ec'
    )
  } catch {
    return false
  }
}

/**
 * Parmi les certificats d'une reponse, ceux de l'emetteur demande.
 *
 * Une reponse a une question par identifiant qui ne rend qu'un certificat est
 * prise telle quelle. Toute autre reponse est triee par nom.
 */
function retenir(
  recu: Buffer,
  parIdentifiant: boolean,
  identifiant: string,
  autorite: X509Certificate,
) {
  const lus = certificatsDans(recu)
  const valides = lus.filter((certificat) => chaineValide(certificat, autorite))
  if (parIdentifiant && lus.length === 1) return valides
  return valides
    .filter((certificat) => sujet(certificat).get('CN') === identifiant)
    .slice(0, HOMONYMES_MAX)
}

/**
 * Les certificats de l'emetteur dont il est etabli qu'ils viennent de
 * l'autorite et valaient au jour de signature. Le plus souvent un seul ;
 * plusieurs quand l'autorite a renouvele un certificat sous le meme nom.
 *
 * Liste vide dans tous les autres cas, sans distinguer : autorite inconnue,
 * certificat introuvable, chaine invalide, certificat hors validite au jour
 * de signature, cle d'un type inattendu. La revocation se consulte a part
 * (`revocation.ts`), pour le seul certificat qui verifie la signature.
 */
export async function emetteursDeConfiance(
  codeAutorite: string,
  identifiant: string,
  jour: Date,
  options: {
    telecharger?: Telechargement
    autorites?: Readonly<Record<string, Autorite>>
    journal?: (ligne: string) => void
  } = {},
): Promise<Emetteur[]> {
  const autorites = options.autorites ?? AUTORITES
  const dire = options.journal ?? (() => {})
  const epinglee = Object.hasOwn(autorites, codeAutorite) ? autorites[codeAutorite] : undefined
  if (!epinglee || !/^[A-Z0-9]{4}$/.test(identifiant)) return []
  const autorite = new X509Certificate(epinglee.certificat)
  const cle = `${autorite.fingerprint256} ${identifiant}`
  const maintenant = Date.now()
  let entree = memoire.get(cle)
  if (!entree || entree.jusque < maintenant) {
    let certificats: X509Certificate[] = []
    for (const modele of epinglee.recherches) {
      const parIdentifiant = modele.includes('{id}')
      const adresse = modele.replace('{id}', identifiant)
      const recu = await (options.telecharger ?? telecharger)(
        adresse,
        parIdentifiant ? CERTIFICAT_MAX : ANNUAIRE_MAX,
      )
      certificats = recu ? retenir(recu, parIdentifiant, identifiant, autorite) : []
      dire(
        `Certificat : ${adresse} ${recu ? `a repondu, ${certificats.length} certificat(s) retenu(s)` : 'injoignable ou reponse refusee'}`,
      )
      if (certificats.length) break
    }
    // Seul un certificat dont la chaine tient est garde longtemps : une page
    // d'erreur servie avec un statut 200 ne doit pas bloquer une journee.
    entree = {
      certificats: certificats.map((certificat) => certificat.raw),
      jusque: maintenant + (certificats.length ? DUREE_SUCCES : DUREE_ECHEC),
    }
    if (memoire.size >= ENTREES_MAX) memoire.clear()
    memoire.set(cle, entree)
  }
  if (!valideLe(autorite, jour)) return []
  // La chaine est reverifiee a chaque usage : la memoire ne vaut pas preuve.
  return entree.certificats
    .map((octets) => new X509Certificate(octets))
    .filter((certificat) => chaineValide(certificat, autorite) && valideLe(certificat, jour))
    .map((certificat) => ({ certificat, autorite, organisation: organisation(certificat) }))
}
