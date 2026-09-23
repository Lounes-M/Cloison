'use server'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { adresseDuSite } from '@/lib/courriels/envoi'
import { creerSessionActe } from './stripe'
const reservation = z.object({
  id: z.uuid(),
  facture: z.uuid(),
  montant: z.number().int().min(1).max(100000000),
  tarif: z.string().min(1).max(64),
  session: z
    .string()
    .regex(/^cs_[A-Za-z0-9_]{1,190}$/)
    .nullable(),
  cree_le: z.string(),
})
export async function payerActe(form: FormData) {
  let url: string | null = null
  try {
    if (process.env.FACTURATION_ACTES_ENABLED !== 'true') throw new Error()
    const facture = z.uuid().parse(form.get('facture'))
    const c = await contexteAgence()
    if (c.etat !== 'rattache' || c.agence.statut !== 'verifiee') throw new Error()
    const r = await c.supabase.rpc('reserver_reglement_acte', { la_facture: facture })
    if (r.error) throw new Error()
    const p = reservation.parse(r.data)
    if (
      p.facture !== facture ||
      String(p.montant) !== form.get('montant') ||
      p.tarif !== form.get('tarif')
    )
      throw new Error()
    url = await creerSessionActe(p, adresseDuSite())
  } catch {
    redirect('/espace/facturation?paiement=indisponible')
  }
  redirect((url ?? '/espace/facturation') as Route)
}
