'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { contexteAgence } from './contexte'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { complements } from '@/lib/content/complements'
export type EtatComplement = { statut: 'inactif' | 'enregistre' | 'erreur' }
const uuid = z.uuid()
export async function modifierComplement(
  _p: EtatComplement,
  donnees: FormData,
): Promise<EtatComplement> {
  const dossier = uuid.safeParse(donnees.get('dossier'))
  const cible = uuid.safeParse(donnees.get('cible'))
  const operation = donnees.get('operation')
  if (
    !dossier.success ||
    !cible.success ||
    !['demander', 'fournir', 'valider', 'refuser'].includes(String(operation))
  )
    return { statut: 'erreur' }
  try {
    let db
    if (operation === 'fournir') {
      const porteur = await capaciteDepuisCookies()
      if (
        !porteur ||
        porteur.capacite.partie !== 'garant' ||
        !formulaireDuDossier(donnees, porteur.capacite.dossierId)
      )
        return { statut: 'erreur' }
      db = clientPorteurDeLien(porteur.jeton)
    } else {
      const contexte = await contexteAgence()
      if (contexte.etat !== 'rattache') return { statut: 'erreur' }
      db = contexte.supabase
    }
    const { data: courante, error: lecture } = await db
      .from(operation === 'demander' ? 'pieces' : 'complements_documentaires')
      .select('id')
      .eq('id', cible.data)
      .eq('dossier_id', dossier.data)
      .maybeSingle()
    if (lecture || courante?.id !== cible.data) return { statut: 'erreur' }
    let rpc: string, parametres: Record<string, string>
    if (operation === 'demander') {
      const motif = String(donnees.get('motif'))
      if (!Object.hasOwn(complements.motifs, motif)) return { statut: 'erreur' }
      rpc = 'demander_complement'
      parametres = { la_piece: cible.data, le_motif: motif }
    } else if (operation === 'fournir') {
      const piece = uuid.safeParse(donnees.get('piece'))
      if (!piece.success) return { statut: 'erreur' }
      rpc = 'fournir_complement'
      parametres = { la_demande: cible.data, la_piece: piece.data }
    } else {
      rpc = operation === 'valider' ? 'valider_complement' : 'refuser_complement'
      parametres = { la_demande: cible.data }
    }
    const { data, error } = await db.rpc(rpc, parametres)
    if (error || data !== true) return { statut: 'erreur' }
  } catch {
    console.error('[complement] modification impossible')
    return { statut: 'erreur' }
  }
  revalidatePath('/garant')
  revalidatePath('/espace')
  revalidatePath(`/espace/dossiers/${dossier.data}`)
  return { statut: 'enregistre' }
}
