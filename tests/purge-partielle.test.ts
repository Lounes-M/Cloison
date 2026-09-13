import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { purgerCoffres } from '@/lib/exploitation/purge'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
const prive = 'CHEMIN_PRIVE secret-fictif'
const retentions = [
  'purger_suivis_droits',
  'purger_historique_responsables',
  'purger_brouillons_engagement',
]
function fixture(action: (etape: string) => void = () => {}) {
  const appels: string[] = []
  const faire = (etape: string) => {
    appels.push(etape)
    action(etape)
  }
  const rpc = vi.fn(
    async (nom: string): Promise<{ data: number; error: null | { message: string } }> => {
      faire(nom)
      return { data: 0, error: null }
    },
  )
  const db = {
    rpc,
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => {
            faire('file')
            return { data: [{ chemin: 'fictif/a' }, { chemin: 'fictif/b' }], error: null }
          },
        }),
      }),
      delete: () => ({
        eq: async (_champ: string, chemin: string) => {
          faire(`acquitter:${chemin}`)
          return { error: null }
        },
      }),
    }),
    storage: {
      from: () => ({
        remove: async ([chemin]: string[]) => {
          faire(`retirer:${chemin}`)
          return { error: null }
        },
      }),
    },
  } as unknown as SupabaseClient
  return { db, rpc, appels }
}

test.each(['reprendre_depots_inacheves', 'purger_les_dossiers_expires', 'file'])(
  'une exception de %s ne bloque pas les trois retentions independantes',
  async (etape) => {
    const { db, appels } = fixture((nom) => {
      if (nom === etape) throw new Error(prive)
    })
    expect(await purgerCoffres(db)).toEqual({ traites: 0, echecs: 1 })
    expect(appels.slice(-3)).toEqual(retentions)
    expect(appels.some((nom) => nom.startsWith('retirer:'))).toBe(false)
    if (etape === 'reprendre_depots_inacheves')
      expect(appels).not.toContain('purger_les_dossiers_expires')
    if (etape !== 'file') expect(appels).not.toContain('file')
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(prive)
  },
)

test.each(['reprendre_depots_inacheves', 'purger_les_dossiers_expires'])(
  'un refus de %s reste compte sans rejouer la requete',
  async (etape) => {
    const { db, rpc } = fixture()
    rpc.mockImplementation(async (nom) => ({
      data: 0,
      error: nom === etape ? { message: prive } : null,
    }))
    expect(await purgerCoffres(db)).toEqual({ traites: 0, echecs: 1 })
    expect(rpc.mock.calls.filter(([nom]) => nom === etape)).toHaveLength(1)
    expect(rpc.mock.calls.slice(-3).map(([nom]) => nom)).toEqual(retentions)
  },
)

test.each(['retirer:fictif/a', 'acquitter:fictif/a'])(
  'une exception sur %s conserve le premier objet en file et traite le second',
  async (etape) => {
    const { db, appels } = fixture((nom) => {
      if (nom === etape) throw new Error(prive)
    })
    expect(await purgerCoffres(db)).toEqual({ traites: 1, echecs: 1 })
    expect(appels).toContain('acquitter:fictif/b')
    if (etape.startsWith('retirer:')) expect(appels).not.toContain('acquitter:fictif/a')
    expect(appels.slice(-3)).toEqual(retentions)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(prive)
  },
)

test('les echecs documentaires et administratifs se cumulent sans faux succes', async () => {
  const { db } = fixture((nom) => {
    if (nom !== 'purger_brouillons_engagement') throw new Error(prive)
  })
  expect(await purgerCoffres(db)).toEqual({ traites: 0, echecs: 3 })
})

test('un budget deja epuise interdit tout appel fournisseur', async () => {
  const { db, appels } = fixture()
  const controleur = new AbortController()
  controleur.abort(prive)
  expect(await purgerCoffres(db, controleur.signal)).toEqual({ traites: 0, echecs: 4 })
  expect(appels).toEqual([])
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(prive)
})

test('une interruption apres retrait interdit acquittement et nouvelles operations', async () => {
  const controleur = new AbortController()
  const { db, appels } = fixture((nom) => {
    if (nom === 'retirer:fictif/a') controleur.abort(prive)
  })
  expect(await purgerCoffres(db, controleur.signal)).toEqual({ traites: 0, echecs: 5 })
  expect(appels.at(-1)).toBe('retirer:fictif/a')
  expect(appels).not.toContain('acquitter:fictif/a')
})

test('une interruption conserve les acquittements deja obtenus dans le bilan', async () => {
  const controleur = new AbortController()
  const { db, appels } = fixture((nom) => {
    if (nom === 'acquitter:fictif/a') controleur.abort(prive)
  })
  expect(await purgerCoffres(db, controleur.signal)).toEqual({ traites: 1, echecs: 4 })
  expect(appels.at(-1)).toBe('acquitter:fictif/a')
})
