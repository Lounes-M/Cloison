import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type AgenceDuDossier = { agence: string; logement: string | null; ville: string | null }

/**
 * L'agence qui suit le dossier du porteur de lien, et son logement (0073).
 * Une panne ne bloque pas l'espace : la mention disparait simplement.
 */
export async function agenceDuDossier(supabase: SupabaseClient): Promise<AgenceDuDossier | null> {
  const { data, error } = await supabase.rpc('agence_de_mon_dossier')
  if (error) {
    console.error('[porteur] agence du dossier illisible')
    return null
  }
  const ligne = Array.isArray(data) ? (data[0] as AgenceDuDossier | undefined) : undefined
  return ligne && typeof ligne.agence === 'string' ? ligne : null
}
