import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { creerClientDocage } from './client-docage'
import type { PrestataireSignature } from './prestataire'

function environnement() {
  const e = z.enum(['sandbox', 'production']).safeParse(process.env.SIGNATURE_ENVIRONMENT)
  if (!e.success) throw new Error('Configuration Docage indisponible')
  return e.data
}

/** Docage est le prestataire par defaut. Aucune origine ni cle cote client. */
export function clientDocageConfigure(signal?: AbortSignal) {
  const client = creerClientDocage(
    {
      environnement: environnement(),
      courriel: process.env.DOCAGE_EMAIL ?? '',
      cleApi: process.env.DOCAGE_API_KEY ?? '',
      autoriserMutations: process.env.SIGNATURE_MUTATIONS_ENABLED === 'true',
    },
    fetch,
    signal,
  )
  client satisfies PrestataireSignature
  return client
}

/**
 * Docage ne signe pas ses webhooks. Le `WebhookDTO` de l'API v2 n'a qu'un
 * champ `url` : pas de secret HMAC, pas d'en-tete personnalise. L'URL
 * enregistree en production porte donc toujours `?jeton=`.
 *
 * On accepte aussi `Authorization: Bearer`, pour un relais ou pour le jour ou
 * Docage sortira le secret de la query. Les deux sont compares a chaque appel,
 * avant de combiner, pour que le temps ne dise pas lequel a reussi. L'empreinte
 * SHA-256 rend la comparaison independante de la longueur.
 *
 * Un appel authentifie ne fait que reveiller la lecture du registre, qui relit
 * la transaction avec la cle API avant tout changement d'etat.
 */
function empreinte(valeur: string): Buffer {
  return createHash('sha256').update(valeur).digest()
}

export function verifierJetonDocage(recu: string | null) {
  const attendu = process.env.DOCAGE_WEBHOOK_TOKEN ?? ''
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(attendu)) throw new Error('Jeton Docage indisponible')
  return timingSafeEqual(empreinte(attendu), empreinte(recu ?? ''))
}

export function jetonDocageAccepte(requete: Request) {
  const query = new URL(requete.url).searchParams.get('jeton')
  const entete = /^Bearer\s+(\S+)$/i.exec(requete.headers.get('authorization') ?? '')
  const parQuery = verifierJetonDocage(query)
  const parEntete = verifierJetonDocage(entete?.[1] ?? null)
  return parQuery || parEntete
}

/** Un journal ne doit jamais reprendre l'URL : elle contient le jeton. */
export function masquerJetonDocage(texte: string) {
  const jeton = process.env.DOCAGE_WEBHOOK_TOKEN ?? ''
  if (jeton.length < 8) return texte
  return texte.split(jeton).join('***')
}
