import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { SEAU, inscrireAuJournal, lireCleScellee } from './depot-supabase'
import type { OuvertureBase, PieceOuvrable } from './ouverture'
import type { TypeAccepte } from './type-reel'

/**
 * Le branchement de `OuvertureBase` sur Supabase : ce que l'AGENCE va chercher.
 *
 * Separe de l'adaptateur du depot pour une raison que le test des invariants a
 * fait apparaitre : le module du depot est importe par tout ce qui s'execute
 * pour le garant, et il importait celui de l'ouverture filigranee. Un type
 * seulement, mais un scan ne distingue pas, et il a raison de ne pas le faire.
 * Le garant ne voit jamais ses pieces degradees ; que son code ne sache meme
 * pas ou vit la rasterisation est la facon la plus simple de le tenir.
 */

/** Le pendant en lecture : ce que l'ouverture d'une piece va chercher. */
export function baseOuvertureSupabase(supabase: SupabaseClient): OuvertureBase {
  return {
    async piece(pieceId): Promise<PieceOuvrable | null> {
      const { data, error } = await supabase
        .from('pieces')
        .select('dossier_id, chemin, type_reel')
        .eq('id', pieceId)
        .maybeSingle()

      if (error || !data) {
        if (error) console.error('[coffre] lecture de la piece impossible', error)
        return null
      }

      return {
        dossierId: data.dossier_id as string,
        chemin: data.chemin as string,
        // La contrainte `type_reel` de la migration 0006 borne cette colonne
        // aux trois valeurs acceptees : rien d'autre ne peut s'y trouver.
        typeReel: data.type_reel as TypeAccepte,
      }
    },

    cleScellee: (dossierId) => lireCleScellee(supabase, dossierId),

    async telecharger(chemin) {
      const { data, error } = await supabase.storage.from(SEAU).download(chemin)

      if (error || !data) {
        if (error) console.error('[coffre] telechargement refuse', error)
        return null
      }

      return Buffer.from(await data.arrayBuffer())
    },

    journaliser: (dossierId, action, pieceId) =>
      inscrireAuJournal(supabase, dossierId, action, pieceId),
  }
}
