'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { contexteAgence } from './contexte'
export type EtatResponsable = { statut: 'inactif' | 'enregistre' | 'erreur' }
const saisie = z.object({
  dossier: z.uuid(),
  membre: z.union([z.literal(''), z.uuid()]),
  revision: z.union([z.literal(''), z.uuid()]),
  confirmation: z.literal('on'),
})
export async function affecterDossier(
  _precedent: EtatResponsable,
  form: FormData,
): Promise<EtatResponsable> {
  const r = saisie.safeParse(Object.fromEntries(form))
  if (!r.success) return { statut: 'erreur' }
  try {
    const c = await contexteAgence()
    if (c.etat !== 'rattache') return { statut: 'erreur' }
    if (c.role !== 'admin' && r.data.membre !== '' && r.data.membre !== c.utilisateurId)
      return { statut: 'erreur' }
    const { data, error } = await c.supabase.rpc('affecter_dossier', {
      le_dossier: r.data.dossier,
      le_membre: r.data.membre || null,
      revision_attendue: r.data.revision || null,
    })
    if (error || !z.uuid().safeParse(data).success) return { statut: 'erreur' }
    revalidatePath('/espace')
    revalidatePath(`/espace/dossiers/${r.data.dossier}`)
    return { statut: 'enregistre' }
  } catch {
    return { statut: 'erreur' }
  }
}
