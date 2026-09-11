'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { contexteAgence } from './contexte'
export type EtatRappels = { statut: 'inactif' | 'enregistre' | 'erreur' }
const saisie = z.object({
  relance: z.enum(['0', '3', '7', '14']),
  echeance: z.enum(['0', '3', '7']),
  revision: z.union([z.literal(''), z.uuid()]),
  confirmation: z.literal('on'),
})
export async function reglerRappels(_precedent: EtatRappels, form: FormData): Promise<EtatRappels> {
  const r = saisie.safeParse(Object.fromEntries(form))
  if (!r.success) return { statut: 'erreur' }
  try {
    const c = await contexteAgence()
    if (c.etat !== 'rattache' || c.role !== 'admin') return { statut: 'erreur' }
    const { data, error } = await c.supabase.rpc('regler_rappels', {
      relance: Number(r.data.relance),
      echeance: Number(r.data.echeance),
      revision_attendue: r.data.revision || null,
    })
    if (error || !z.uuid().safeParse(data).success) return { statut: 'erreur' }
    revalidatePath('/espace/rappels')
    return { statut: 'enregistre' }
  } catch {
    return { statut: 'erreur' }
  }
}
