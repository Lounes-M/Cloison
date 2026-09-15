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
  }[] = []
  const from = vi.fn(() => {
    const n = requetes.length
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      lte: vi.fn(),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          n === 1 ? { error: { message: 'prive' }, count: null } : { error: null, count: n },
        ).then(resolve),
    }
    for (const fn of [q.select, q.eq, q.gt, q.lte]) fn.mockReturnValue(q)
    requetes.push(q)
    return q
  })
  const contexte = { agence: { id: 'agence' }, supabase: { from } } as unknown as Extract<
    ContexteAgence,
    { etat: 'rattache' }
  >
  const resultats = await lirePriorites(contexte)
  expect(resultats.map((r) => r.nombre)).toEqual([0, null, 2, 3])
  for (const q of requetes) {
    expect(q.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(q.eq).toHaveBeenCalledWith('agence_id', 'agence')
    expect(q.gt.mock.calls).toEqual(requetes[0]!.gt.mock.calls)
  }
  expect(
    Date.parse(requetes[3]!.lte.mock.calls[0]![1]) - Date.parse(requetes[0]!.gt.mock.calls[0]![1]),
  ).toBe(7 * 86400000)
})
