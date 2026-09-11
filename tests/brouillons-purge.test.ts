import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { purgerCoffres } from '@/lib/exploitation/purge'
test.each([0, 1000, null, -1, 1001, 0.5, '0', 'erreur', 'exception'])(
  'la maintenance detecte un resultat invalide de purge des brouillons : %s',
  async (resultat) => {
    const rpc = vi.fn(async (nom: string) => {
      if (nom !== 'purger_brouillons_engagement') return { data: 0, error: null }
      if (resultat === 'exception') throw new Error('detail interne prive')
      return {
        data: resultat,
        error: resultat === 'erreur' ? { message: 'detail interne prive' } : null,
      }
    })
    const db = {
      rpc,
      from: () => ({
        select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      }),
    } as unknown as SupabaseClient
    expect(await purgerCoffres(db)).toEqual({
      traites: 0,
      echecs: resultat === 0 || resultat === 1000 ? 0 : 1,
    })
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'reprendre_depots_inacheves',
      'purger_les_dossiers_expires',
      'purger_suivis_droits',
      'purger_historique_responsables',
      'purger_brouillons_engagement',
    ])
  },
)
