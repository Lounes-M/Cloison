import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Les dossiers dont les relances sont epuisees, lus une fois par rendu.
 *
 * Le tableau de bord en a besoin trois fois : le filtre, les pastilles de la
 * liste et l'indicateur de pilotage. La fonction SQL (0077) parcourt les
 * rappels de l'agence ; la memoire de rendu de React evite de la rejouer. La
 * cle est le client de la requete en cours : rien ne passe d'un visiteur a
 * l'autre, et une action serveur relit toujours la base.
 */
export const lireRelancesEpuisees = cache(async (supabase: SupabaseClient) => {
  const { data, error } = await supabase.rpc('dossiers_relances_epuisees')
  return {
    panne: Boolean(error),
    ids: !error && Array.isArray(data) ? (data as string[]) : [],
  }
})
