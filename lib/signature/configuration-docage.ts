import 'server-only'
import { timingSafeEqual } from 'node:crypto'
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
 * Docage ne signe pas ses webhooks : l'URL enregistree chez lui porte un jeton
 * secret. Un appel authentifie ne fait que reveiller la lecture du registre,
 * qui relit la transaction avec la cle API avant tout changement d'etat.
 */
export function verifierJetonDocage(recu: string | null) {
  const attendu = process.env.DOCAGE_WEBHOOK_TOKEN ?? ''
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(attendu)) throw new Error('Jeton Docage indisponible')
  const a = Buffer.from(attendu),
    r = Buffer.from(recu ?? '')
  return r.length === a.length && timingSafeEqual(r, a)
}
