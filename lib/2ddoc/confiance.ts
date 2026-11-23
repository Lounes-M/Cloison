import { X509Certificate } from 'node:crypto'

import { AUTORITES, type Autorite } from './autorites.ts'

/**
 * D'ou vient la cle qui verifie un 2D-Doc.
 *
 * L'en-tete du code nomme une autorite (FR01, FR04...) et un certificat
 * d'emetteur. Les autorites sont epinglees dans `autorites.ts`, d'apres la
 * liste de confiance de l'ANTS. Le certificat de l'emetteur, lui, se telecharge
 * a l'adresse que l'autorite publie dans cette liste.
 *
 * Ce telechargement n'a pas a etre cru : le certificat recu n'est retenu que
 * s'il est signe par l'autorite epinglee et valide au jour de signature du
 * document. Une adresse fausse, une reponse substituee ou une panne donnent
 * toutes la meme chose : pas de cle, donc « non verifiable ».
 *
 * Seul l'identifiant du certificat (quatre caracteres) part vers l'autorite.
 * Aucune donnee du document ni de la personne.
 */

export type Emetteur = { certificat: X509Certificate; organisation: string }

/** Telecharge un certificat. Remplacable dans les essais. */
export type Telechargement = (adresse: string) => Promise<Buffer | null>

const CERTIFICAT_MAX = 8192
const DELAI = 4000
const DUREE_SUCCES = 24 * 3_600_000
const DUREE_ECHEC = 10 * 60_000
const ENTREES_MAX = 64

const memoire = new Map<string, { certificat: Buffer | null; jusque: number }>()

/** Vide la memoire des certificats : essais uniquement. */
export function oublierCertificats() {
  memoire.clear()
}

export const telechargerCertificat: Telechargement = async (adresse) => {
  try {
    const reponse = await fetch(adresse, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI),
    })
    if (!reponse.ok || !reponse.body) return null
    const annonce = Number(reponse.headers.get('content-length') ?? 0)
    if (annonce > CERTIFICAT_MAX) return null
    const blocs: Buffer[] = []
    let taille = 0
    for await (const bloc of reponse.body) {
      taille += bloc.length
      if (taille > CERTIFICAT_MAX) return null
      blocs.push(Buffer.from(bloc))
    }
    return taille ? Buffer.concat(blocs) : null
  } catch {
    return null
  }
}

function adresseDuCertificat(autorite: Autorite, identifiant: string) {
  if (!autorite.parNom || !/^[A-Z0-9]{4}$/.test(identifiant)) return null
  return `${autorite.adresse}?name=${identifiant}`
}

function valideLe(certificat: X509Certificate, jour: Date) {
  // Le jour de signature est connu a la journee pres.
  return (
    new Date(certificat.validFrom).getTime() <= jour.getTime() + 86_400_000 &&
    new Date(certificat.validTo).getTime() >= jour.getTime()
  )
}

function organisation(certificat: X509Certificate) {
  const champs = new Map(
    certificat.subject.split('\n').map((ligne) => {
      const egal = ligne.indexOf('=')
      return [ligne.slice(0, egal), ligne.slice(egal + 1)] as const
    }),
  )
  const nom = (champs.get('O') ?? champs.get('CN') ?? '').replace(/[^\p{L}\p{N} .,'&()/-]/gu, '')
  return nom.trim().slice(0, 80)
}

/**
 * Le certificat de l'emetteur, s'il est etabli qu'il vient de l'autorite.
 *
 * `null` dans tous les autres cas, sans distinguer : autorite inconnue,
 * certificat introuvable, chaine invalide, certificat hors validite au jour
 * de signature, cle d'un type inattendu.
 */
export async function emetteurDeConfiance(
  codeAutorite: string,
  identifiant: string,
  jour: Date,
  telecharger: Telechargement = telechargerCertificat,
  autorites: Readonly<Record<string, Autorite>> = AUTORITES,
): Promise<Emetteur | null> {
  const autorite = Object.hasOwn(autorites, codeAutorite) ? autorites[codeAutorite] : undefined
  if (!autorite) return null
  const adresse = adresseDuCertificat(autorite, identifiant)
  if (!adresse) return null
  const racine = new X509Certificate(autorite.certificat)
  const maintenant = Date.now()
  let entree = memoire.get(adresse)
  if (!entree || entree.jusque < maintenant) {
    // Seul un certificat dont la chaine tient est garde longtemps : une page
    // d'erreur servie avec un statut 200 ne doit pas bloquer une journee.
    const recu = await telecharger(adresse)
    const certificat = recu && chaineValide(recu, racine) ? recu : null
    entree = { certificat, jusque: maintenant + (certificat ? DUREE_SUCCES : DUREE_ECHEC) }
    if (memoire.size >= ENTREES_MAX) memoire.clear()
    memoire.set(adresse, entree)
  }
  // La chaine est reverifiee a chaque usage : la memoire ne vaut pas preuve.
  const certificat = entree.certificat && chaineValide(entree.certificat, racine)
  if (!certificat) return null
  if (!valideLe(certificat, jour) || !valideLe(racine, jour)) return null
  return { certificat, organisation: organisation(certificat) }
}

/** Le certificat, s'il est signe par l'autorite et porte une cle elliptique. */
function chaineValide(octets: Buffer, racine: X509Certificate) {
  try {
    const certificat = new X509Certificate(octets)
    if (!certificat.checkIssued(racine) || !certificat.verify(racine.publicKey)) return null
    if (certificat.publicKey.asymmetricKeyType !== 'ec') return null
    return certificat
  } catch {
    return null
  }
}
