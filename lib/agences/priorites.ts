import 'server-only'
import type { ContexteAgence } from './contexte'
import { pilotage } from '@/lib/content/pilotage'

export async function lirePriorites(contexte: Extract<ContexteAgence, { etat: 'rattache' }>) {
  const maintenant = Date.now()
  return Promise.all(
    pilotage.indicateurs.map(async ({ cle }) => {
      try {
        // Un dossier compte une fois, quel que soit le nombre de pieces
        // proposees : l'embarquement `!inner` filtre les dossiers, pas les lignes.
        let requete = contexte.supabase
          .from('dossiers')
          .select(cle === 'remplacement' ? 'id, complements_documentaires!inner()' : 'id', {
            count: 'exact',
            head: true,
          })
          .eq('agence_id', contexte.agence.id)
          .gt('expire_le', new Date(maintenant).toISOString())
        requete =
          cle === 'echeance'
            ? requete.lte('expire_le', new Date(maintenant + 7 * 86400000).toISOString())
            : cle === 'remplacement'
              ? requete.eq('complements_documentaires.etat', 'fourni')
              : requete.eq('statut', cle)
        const { count, error } = await requete
        return { cle, nombre: !error && Number.isSafeInteger(count) && count! >= 0 ? count : null }
      } catch {
        return { cle, nombre: null }
      }
    }),
  )
}
