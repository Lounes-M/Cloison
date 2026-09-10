'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { contexteAgence } from '@/lib/agences/contexte'
import { empreinteConnecteur, nouvelleCleConnecteur } from './cles'
export type EtatConnecteur = { ok: boolean; cle?: string }
export async function gererConnecteur(form: FormData): Promise<EtatConnecteur> {
  try {
    const contexte = await contexteAgence()
    if (
      contexte.etat !== 'rattache' ||
      contexte.role !== 'admin' ||
      form.get('agence') !== contexte.agence.id ||
      form.get('confirmation') !== 'on'
    )
      return { ok: false }
    if (form.get('operation') === 'creer') {
      const nom = z.string().trim().min(1).max(80).safeParse(form.get('nom'))
      if (!nom.success) return { ok: false }
      const cle = nouvelleCleConnecteur()
      const { data, error } = await contexte.supabase.rpc('creer_connecteur', {
        le_nom: nom.data,
        l_empreinte: empreinteConnecteur(cle),
      })
      if (error || !z.uuid().safeParse(data).success) return { ok: false }
      revalidatePath('/espace/connecteurs')
      return { ok: true, cle }
    }
    if (form.get('operation') === 'revoquer') {
      const id = z.uuid().safeParse(form.get('id'))
      if (!id.success) return { ok: false }
      const { data, error } = await contexte.supabase.rpc('revoquer_connecteur', {
        le_connecteur: id.data,
      })
      if (error || data !== true) return { ok: false }
      revalidatePath('/espace/connecteurs')
      return { ok: true }
    }
  } catch {
    return { ok: false }
  }
  return { ok: false }
}
