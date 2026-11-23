import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type MaColocation = {
  colocataires: number
  loyerTotalCents: number
  etendue: 'part' | 'loyer_entier'
}

/**
 * La colocation du dossier du porteur de lien (0089) : combien de
 * colocataires, le loyer total du bail et l'etendue de l'engagement. Rien des
 * autres dossiers. Une panne ne bloque pas l'espace : la mention disparait.
 */
export async function maColocation(supabase: SupabaseClient): Promise<MaColocation | null> {
  const { data, error } = await supabase.rpc('ma_colocation')
  if (error) {
    console.error('[porteur] colocation illisible')
    return null
  }
  const ligne = Array.isArray(data) ? data[0] : undefined
  const total = Number(ligne?.loyer_total_cents)
  const n = Number(ligne?.colocataires)
  if (!ligne || !Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(n)) return null
  return {
    colocataires: n,
    loyerTotalCents: total,
    etendue: ligne.etendue === 'loyer_entier' ? 'loyer_entier' : 'part',
  }
}
