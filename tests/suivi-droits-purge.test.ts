import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { purgerCoffres } from '@/lib/exploitation/purge'

test.each([0, 100, null, -1, 101, 0.5, '0', 'erreur', 'exception'])(
  'la purge des pieces precede le suivi et signale un resultat invalide : %s',
  async (resultat) => {
    const ordre: string[] = []
    const rpc = vi.fn(async (nom: string) => {
      ordre.push(nom)
      if (nom === 'purger_historique_responsables' || nom === 'purger_brouillons_engagement')
        return { data: 0, error: null }
      if (nom !== 'purger_suivis_droits') return { data: null, error: null }
      if (resultat === 'exception') throw new Error('panne fictive privee')
      return {
        data: resultat,
        error: resultat === 'erreur' ? { message: 'panne fictive privee' } : null,
      }
    })
    const db = {
      rpc,
      from: () => ({
        select: () => ({
          order: () => ({
            limit: async () => ({ data: [{ chemin: 'fictif/objet' }], error: null }),
          }),
        }),
        delete: () => ({
          eq: async () => {
            ordre.push('acquittement')
            return { error: null }
          },
        }),
      }),
      storage: {
        from: () => ({
          remove: async () => {
            ordre.push('octets')
            return { error: null }
          },
        }),
      },
    } as unknown as SupabaseClient
    expect(await purgerCoffres(db)).toEqual({
      traites: 1,
      echecs: resultat === 0 || resultat === 100 ? 0 : 1,
    })
    expect(ordre).toEqual([
      'reprendre_depots_inacheves',
      'purger_les_dossiers_expires',
      'octets',
      'acquittement',
      'purger_suivis_droits',
      'purger_historique_responsables',
      'purger_brouillons_engagement',
    ])
  },
)
