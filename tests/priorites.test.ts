import { expect, test, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { lirePriorites } from '@/lib/agences/priorites'
import type { ContexteAgence } from '@/lib/agences/contexte'
test('les compteurs restent cloisonnes, bornes et une panne ne devient pas zero', async () => {
  const requetes: {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    gt: ReturnType<typeof vi.fn>
    lte: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    lt: ReturnType<typeof vi.fn>
  }[] = []
  const from = vi.fn(() => {
    const n = requetes.length
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      lte: vi.fn(),
      in: vi.fn(),
      lt: vi.fn(),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          n === 1 ? { error: { message: 'prive' }, count: null } : { error: null, count: n },
        ).then(resolve),
    }
    for (const fn of [q.select, q.eq, q.gt, q.lte, q.in, q.lt]) fn.mockReturnValue(q)
    requetes.push(q)
    return q
  })
  const rpc = vi.fn(async () => ({ data: ['d1', 'd2', 'd3'], error: null }))
  const contexte = { agence: { id: 'agence' }, supabase: { from, rpc } } as unknown as Extract<
    ContexteAgence,
    { etat: 'rattache' }
  >
  const resultats = await lirePriorites(contexte)
  expect(resultats.map((r) => r.cle)).toEqual([
    'complet',
    'garant_insuffisant',
    'transmis',
    'remplacement',
    'sans_nouvelles',
    'relances_epuisees',
    'echeance',
  ])
  // Les relances epuisees passent par la fonction dediee, sans requete directe.
  expect(rpc).toHaveBeenCalledWith('dossiers_relances_epuisees')
  expect(resultats.map((r) => r.nombre)).toEqual([0, null, 2, 3, 4, 3, 5])
  for (const [i, q] of requetes.entries()) {
    expect(q.select).toHaveBeenCalledWith(
      i === 3 ? 'id, complements_documentaires!inner()' : 'id',
      { count: 'exact', head: true },
    )
    expect(q.eq).toHaveBeenCalledWith('agence_id', 'agence')
    expect(q.gt.mock.calls).toEqual(requetes[0]!.gt.mock.calls)
  }
  // Un remplacement propose par le garant attend l'agence, quel que soit le statut.
  expect(requetes[3]!.eq).toHaveBeenCalledWith('complements_documentaires.etat', 'fourni')
  expect(requetes[3]!.eq).not.toHaveBeenCalledWith('statut', expect.anything())
  // Sans nouvelles : en attente d'un porteur, et rien depuis sept jours.
  expect(requetes[4]!.in).toHaveBeenCalledWith('statut', ['ouvert', 'depot_en_cours'])
  expect(
    Date.parse(requetes[0]!.gt.mock.calls[0]![1]) - Date.parse(requetes[4]!.lt.mock.calls[0]![1]),
  ).toBe(7 * 86400000)
  expect(requetes[4]!.lt.mock.calls[0]![0]).toBe('activite_rappel_le')
  expect(
    Date.parse(requetes[5]!.lte.mock.calls[0]![1]) - Date.parse(requetes[0]!.gt.mock.calls[0]![1]),
  ).toBe(7 * 86400000)
})

test('une panne de la fonction des relances epuisees ne devient pas zero', async () => {
  const contexte = {
    agence: { id: 'agence' },
    supabase: {
      from: () => {
        throw new Error('hors sujet')
      },
      rpc: async () => ({ data: null, error: { message: 'prive' } }),
    },
  } as unknown as Extract<ContexteAgence, { etat: 'rattache' }>
  const resultats = await lirePriorites(contexte)
  expect(resultats.find((r) => r.cle === 'relances_epuisees')!.nombre).toBeNull()
})
