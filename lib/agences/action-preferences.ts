'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { contexteAgence } from './contexte'
export type EtatPreferences = { statut: 'inactif' | 'enregistre' | 'erreur' }
const saisie = z.object({
  mode: z.enum(['tous', 'mes', 'aucun']),
  revision: z.union([z.literal(''), z.uuid()]),
  confirmation: z.literal('on'),
})
export async function reglerNotifications(
  _precedent: EtatPreferences,
  form: FormData,
): Promise<EtatPreferences> {
  const r = saisie.safeParse(Object.fromEntries(form))
  if (!r.success) return { statut: 'erreur' }
  try {
    const c = await contexteAgence()
    if (c.etat !== 'rattache') return { statut: 'erreur' }
    const { data, error } = await c.supabase.rpc('regler_notifications', {
      le_mode: r.data.mode,
      revision_attendue: r.data.revision || null,
    })
    if (error || !z.uuid().safeParse(data).success) return { statut: 'erreur' }
    revalidatePath('/espace/notifications')
    return { statut: 'enregistre' }
  } catch {
    return { statut: 'erreur' }
  }
}
