'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { contexteAgence } from '@/lib/agences/contexte'
import { collaborateurs as textes } from '@/lib/content/collaborateurs'
export type EtatCollaborateur = { message?: string; erreur?: boolean }
export async function modifierCollaborateur(
  _etat: EtatCollaborateur,
  form: FormData,
): Promise<EtatCollaborateur> {
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache' || contexte.role !== 'admin')
    return { erreur: true, message: textes.session }
  if (form.get('agence') !== contexte.agence.id)
    return { erreur: true, message: textes.autreAgence }
  const cible = String(form.get('cible') ?? ''),
    avant = String(form.get('avant') ?? ''),
    operation = String(form.get('operation') ?? '')
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(cible) ||
    !['admin', 'membre', 'exclu'].includes(avant) ||
    !['admin', 'membre', 'exclure', 'readmettre'].includes(operation) ||
    form.get('confirmation') !== 'on'
  )
    return { erreur: true, message: textes.invalide }
  if (
    (avant === 'exclu') !== (operation === 'readmettre') ||
    (operation === 'exclure' && cible === contexte.utilisateurId)
  )
    return { erreur: true, message: textes.invalide }
  try {
    const db = contexte.supabase
    if (operation === 'readmettre') {
      const { data, error } = await db.rpc('readmettre_collaborateur', { cible })
      if (error || data !== true) return { erreur: true, message: textes.echec }
    } else {
      const requete =
        operation === 'exclure'
          ? db.from('membres_agence').delete()
          : db.from('membres_agence').update({ role: operation })
      const { data, error } = await requete
        .eq('agence_id', contexte.agence.id)
        .eq('utilisateur_id', cible)
        .eq('role', avant)
        .select('utilisateur_id')
      if (error || !Array.isArray(data) || data.length !== 1)
        return {
          erreur: true,
          message: error?.code === '23514' ? textes.dernierAdmin : textes.echec,
        }
    }
  } catch {
    return { erreur: true, message: textes.echec }
  }
  revalidatePath('/espace/collaborateurs')
  revalidatePath('/espace')
  if (cible === contexte.utilisateurId && operation === 'membre') redirect('/espace')
  return { message: textes.succes }
}
