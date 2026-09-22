import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const environnementYoutrust = z.enum(['sandbox', 'production'])
export type EnvironnementYoutrust = z.infer<typeof environnementYoutrust>
export const identifiantYoutrust = z.uuid()
export const etatYoutrust = z.enum([
  'draft',
  'approval',
  'ongoing',
  'paused',
  'rejected',
  'declined',
  'canceled',
  'expired',
  'deleted',
  'done',
])
export type EtatYoutrust = z.infer<typeof etatYoutrust>

const evenement = z.object({
  event_id: identifiantYoutrust,
  event_name: z.string(),
  // Le fournisseur documente un timestamp Unix sous forme de chaine.
  event_time: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,10}$/)]),
  subscription_id: identifiantYoutrust,
  sandbox: z.boolean(),
  data: z.object({
    signature_request: z.object({ id: identifiantYoutrust, status: etatYoutrust }),
  }),
})

const ETATS: Record<string, readonly EtatYoutrust[]> = {
  'signature_request.activated': ['ongoing', 'approval'],
  'signature_request.done': ['done'],
  'signature_request.expired': ['expired'],
  'signature_request.canceled': ['canceled'],
  'signature_request.declined': ['declined'],
  'signature_request.rejected': ['rejected'],
  'signature_request.deleted': ['deleted'],
  'signature_request.approved': ['ongoing'],
  'signature_request.reactivated': ['ongoing', 'approval'],
}

export type NotificationYoutrust = {
  evenement: string
  transaction: string
  etat: EtatYoutrust
  creeLe: number
}

/** Authentifie uniquement. Le consommateur doit dedupliquer durablement event_id,
 * rattacher la demande au dossier local et relire son etat avant toute mutation.
 * Les nouvelles tentatives peuvent etre anciennes : pas de fenetre anti-rejeu volatile.
 */
export function creerVerificateurYoutrust(configuration: {
  environnement: EnvironnementYoutrust
  secret: string
  abonnement: string
}) {
  const valide = z
    .strictObject({
      environnement: environnementYoutrust,
      secret: z
        .string()
        .min(32)
        .max(1024)
        .regex(/^[!-~]+$/),
      abonnement: identifiantYoutrust,
    })
    .safeParse(configuration)
  if (!valide.success) throw new Error('Authentification Youtrust indisponible')
  const { secret, abonnement, environnement } = valide.data
  return (corps: Uint8Array, signature: string | null): NotificationYoutrust | null => {
    try {
      if (
        !corps.byteLength ||
        corps.byteLength > 65536 ||
        !signature ||
        !/^sha256=[0-9a-f]{64}$/.test(signature)
      )
        return null
      const attendue = createHmac('sha256', secret).update(corps).digest()
      if (!timingSafeEqual(attendue, Buffer.from(signature.slice(7), 'hex'))) return null
      const notification = evenement.safeParse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(corps)),
      )
      if (!notification.success) return null
      const e = notification.data
      const creeLe = Number(e.event_time)
      if (
        e.subscription_id !== abonnement ||
        e.sandbox !== (environnement === 'sandbox') ||
        creeLe > Date.now() / 1000 + 300 ||
        !Object.hasOwn(ETATS, e.event_name) ||
        !ETATS[e.event_name]?.includes(e.data.signature_request.status)
      )
        return null
      return {
        evenement: e.event_id,
        transaction: e.data.signature_request.id,
        etat: e.data.signature_request.status,
        creeLe,
      }
    } catch {
      return null
    }
  }
}
