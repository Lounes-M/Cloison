import 'server-only'
import { z } from 'zod'
const NATURES = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.failed',
  'email.complained',
  'email.suppressed',
] as const
const reference = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const evenement = z.object({
  type: z.enum(NATURES),
  created_at: z.string().datetime({ offset: true }),
  data: z.object({ email_id: reference, tags: z.record(z.string(), z.string()).optional() }),
})
/** Recu uniquement apres verification cryptographique du corps brut. */
export function extraireEvenementCourriel(valeur: unknown, id: string) {
  if (
    valeur &&
    typeof valeur === 'object' &&
    'type' in valeur &&
    typeof valeur.type === 'string' &&
    !NATURES.includes(valeur.type as (typeof NATURES)[number])
  )
    return null
  const lu = evenement.parse(valeur)
  const tag = lu.data.tags?.cloison_id
  return {
    evenement: reference.parse(id),
    reference_fournisseur: lu.data.email_id,
    identifiant: tag === undefined ? null : z.uuid().parse(tag),
    nature: lu.type,
    survenu: lu.created_at,
  }
}
export { lireCorpsWebhook as lireCorpsCourriel } from '@/lib/http/corps-webhook'
