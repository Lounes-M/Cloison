'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { contexteAgence } from './contexte'
export type EtatExamen = { statut: 'inactif' | 'enregistre' | 'erreur' }
const saisie = z.object({
  dossier: z.uuid(),
  piece: z.uuid(),
  revision: z.union([z.literal(''), z.uuid()]),
  etat: z.enum(['examine', 'a_revoir', 'a_examiner']),
  confirmation: z.literal('on'),
})
export async function enregistrerExamen(
  _precedent: EtatExamen,
  form: FormData,
): Promise<EtatExamen> {
  const r = saisie.safeParse(Object.fromEntries(form))
  if (!r.success) return { statut: 'erreur' }
  try {
    const c = await contexteAgence()
    if (c.etat !== 'rattache') return { statut: 'erreur' }
    const { data, error } = await c.supabase.rpc('enregistrer_examen_documentaire', {
      le_dossier: r.data.dossier,
      la_piece: r.data.piece,
      le_statut: r.data.etat,
      revision_attendue: r.data.revision || null,
    })
    if (error || !z.uuid().safeParse(data).success) return { statut: 'erreur' }
    revalidatePath(`/espace/dossiers/${r.data.dossier}`)
    return { statut: 'enregistre' }
  } catch {
    return { statut: 'erreur' }
  }
}
