import 'server-only'
import {
  DEMANDE_MAX,
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  SECRET_MIN,
  signatureEgale,
  signerDemande,
  signerReponse,
} from './protocole-documentaire'

const SORTIE_MAX = 30 * 1024 * 1024
const DELAI = 45_000
const CONCURRENCE_MAX = 4
let actifs = 0

export type ConfigurationMoteurDistant = { url: URL; secret: string }

const indisponible = () => new Error('Moteur documentaire indisponible')

/**
 * Service documentaire confine, active par DOCUMENTAIRE_DISTANT_URL.
 *
 * Sans URL, le processus local reste utilise. Une configuration partielle ou
 * invalide echoue fermee : jamais de repli silencieux vers le processus local
 * une fois le service distant demande.
 */
export function configurationMoteurDistant(): ConfigurationMoteurDistant | null {
  const brute = process.env.DOCUMENTAIRE_DISTANT_URL?.trim()
  const secret = process.env.DOCUMENTAIRE_DISTANT_SECRET?.trim() ?? ''
  if (!brute) {
    if (secret) throw indisponible()
    return null
  }
  let url: URL
  try {
    url = new URL('/v1/traiter', brute)
  } catch {
    throw indisponible()
  }
  const locale = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && locale)) ||
    url.username ||
    url.password ||
    secret.length < SECRET_MIN
  )
    throw indisponible()
  return { url, secret }
}

/** Corps de reponse borne avant allocation complete. */
async function lireBorne(reponse: Response) {
  if (!reponse.body) throw indisponible()
  const blocs: Uint8Array[] = []
  let taille = 0
  for await (const bloc of reponse.body) {
    taille += bloc.length
    if (taille > SORTIE_MAX) throw new Error('Sortie trop volumineuse')
    blocs.push(bloc)
  }
  return Buffer.concat(blocs, taille)
}

/** Meme demande JSON que le processus local ; rend la reponse brute du moteur. */
export async function executerMoteurDistant(
  entree: Buffer,
  { url, secret }: ConfigurationMoteurDistant,
): Promise<Buffer> {
  if (entree.length > DEMANDE_MAX) throw new Error('Entree trop volumineuse')
  if (actifs >= CONCURRENCE_MAX) throw new Error('Traitement occupe, reessaie dans un instant')
  actifs++
  try {
    const horodatage = String(Date.now())
    const signature = signerDemande(secret, horodatage, entree)
    let reponse: Response
    try {
      reponse = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(DELAI),
        headers: {
          'Content-Type': 'application/json',
          [ENTETE_HORODATAGE]: horodatage,
          [ENTETE_SIGNATURE]: signature,
        },
        body: new Uint8Array(entree),
      })
    } catch {
      throw indisponible()
    }
    if (reponse.status === 503) {
      await reponse.body?.cancel()
      throw new Error('Traitement occupe, reessaie dans un instant')
    }
    if (reponse.status === 502) {
      await reponse.body?.cancel()
      throw new Error('Document refuse par le moteur')
    }
    if (reponse.status !== 200) {
      await reponse.body?.cancel()
      throw indisponible()
    }
    let corps: Buffer
    try {
      corps = await lireBorne(reponse)
    } catch (erreur) {
      if (erreur instanceof Error && erreur.message === 'Sortie trop volumineuse') throw erreur
      throw indisponible()
    }
    // Reponse liee a cette demande : ni rejeu d'une autre reponse, ni alteration.
    if (
      !signatureEgale(
        reponse.headers.get(ENTETE_SIGNATURE),
        signerReponse(secret, signature, 200, corps),
      )
    )
      throw indisponible()
    return corps
  } finally {
    actifs--
  }
}
