import 'server-only'
import { z } from 'zod'
const reference = (prefixe: string) =>
  z.string().regex(new RegExp(`^${prefixe}_[A-Za-z0-9_]{1,190}$`))
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const somme = z.number().int().min(0).max(100000000)
const devise = z.string().regex(/^[a-z]{3}$/)
const referencePaiement = z
  .union([reference('pi'), z.object({ id: reference('pi') })])
  .transform((v) => (typeof v === 'string' ? v : v.id))
const commun = z.object({
  id: reference('evt'),
  created: z.number().int().nonnegative(),
  type: z.string(),
  data: z.object({ object: z.unknown() }),
})
export type EvenementFinancier = {
  rpc: 'enregistrer_paiement_locataire' | 'enregistrer_suivi_paiement'
  parametres: Record<string, string | number | null>
}
/** Ne recoit qu'un evenement deja authentifie par le SDK Stripe. Aucun corps brut ne sort. */
export function extraireEvenementFinancier(valeur: unknown): EvenementFinancier | null {
  const type = z.object({ type: z.string() }).parse(valeur).type
  if (
    type !== 'checkout.session.completed' &&
    type !== 'charge.refunded' &&
    !['charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'].includes(type)
  )
    return null
  const evenement = commun.parse(valeur)
  const date = new Date(evenement.created * 1000)
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000)
    throw new Error('Date financiere invalide')
  const base = { evenement: evenement.id, survenu: date.toISOString() }
  if (type === 'checkout.session.completed') {
    const statut = z
      .object({ payment_status: z.string(), mode: z.string() })
      .parse(evenement.data.object)
    if (statut.payment_status !== 'paid' || statut.mode !== 'payment') return null
    const contexte = z
      .object({
        metadata: z.object({ dossier_id: z.unknown().optional() }).nullish(),
        client_reference_id: z.unknown().optional(),
      })
      .parse(evenement.data.object)
    if (
      contexte.metadata?.dossier_id == null &&
      !uuid.safeParse(contexte.client_reference_id).success
    )
      return null
    const s = z
      .object({
        id: reference('cs'),
        amount_total: somme.min(1),
        currency: devise,
        payment_intent: referencePaiement.nullish(),
        client_reference_id: uuid.nullish(),
        metadata: z
          .object({
            dossier_id: uuid.optional(),
            tarif_version: z
              .string()
              .regex(/^[a-z0-9-]{1,64}$/)
              .optional(),
          })
          .nullish(),
      })
      .parse(evenement.data.object)
    const dossier = s.metadata?.dossier_id ?? s.client_reference_id
    if (
      !dossier ||
      (s.metadata?.dossier_id &&
        s.client_reference_id &&
        s.metadata.dossier_id.toLowerCase() !== s.client_reference_id.toLowerCase())
    )
      throw new Error('Contexte de paiement incoherent')
    return {
      rpc: 'enregistrer_paiement_locataire',
      parametres: {
        ...base,
        reference_session: s.id,
        reference_paiement: s.payment_intent ?? null,
        le_dossier: dossier,
        montant: s.amount_total,
        devise: s.currency,
        version_tarif: s.metadata?.tarif_version ?? 'locataire-2026-09-04',
      },
    }
  }
  const s = z
    .object({
      id: reference(type === 'charge.refunded' ? 'ch' : 'dp'),
      payment_intent: referencePaiement.nullish(),
      currency: devise,
      amount_refunded: somme.optional(),
      amount: somme.optional(),
      status: z.string().optional(),
    })
    .parse(evenement.data.object)
  if (!s.payment_intent) return null
  const remboursement = type === 'charge.refunded'
  const montant = somme.parse(remboursement ? s.amount_refunded : s.amount)
  const etat = remboursement
    ? 'rembourse'
    : z
        .enum([
          'lost',
          'needs_response',
          'prevented',
          'under_review',
          'warning_closed',
          'warning_needs_response',
          'warning_under_review',
          'won',
        ])
        .parse(s.status)
  return {
    rpc: 'enregistrer_suivi_paiement',
    parametres: {
      ...base,
      reference_paiement: s.payment_intent,
      reference_objet: s.id,
      nature: remboursement ? 'remboursement' : 'litige',
      montant,
      devise: s.currency,
      etat,
    },
  }
}
