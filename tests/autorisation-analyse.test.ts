import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ debit: vi.fn(), serveur: vi.fn() }))
vi.mock('@/lib/acces/debit', () => ({ consommerDebit: h.debit }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.serveur }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '192.0.2.1, 192.0.2.2' }),
}))
import { autoriserAnalyse } from '@/lib/garant/debit-depot'
beforeEach(() => {
  vi.resetAllMocks()
  h.serveur.mockResolvedValue('db')
  h.debit.mockResolvedValue(true)
})
test.each([1, 2, 3])('le refus du compteur %s interdit le traitement', async (numero) => {
  for (let i = 1; i < numero; i++) h.debit.mockResolvedValueOnce(true)
  h.debit.mockResolvedValueOnce(false)
  expect(await autoriserAnalyse('dossier')).toBe(false)
  expect(h.debit).toHaveBeenCalledTimes(numero)
})
test('trois accords sont requis et le compteur global garde la meme cible', async () => {
  expect(await autoriserAnalyse('dossier-a')).toBe(true)
  expect(await autoriserAnalyse('dossier-b')).toBe(true)
  expect(h.debit.mock.calls).toEqual([
    ['db', 'depot_dossier', 'dossier-a'],
    ['db', 'depot_ip', '192.0.2.1'],
    ['db', 'depot_global', 'tous-les-depots'],
    ['db', 'depot_dossier', 'dossier-b'],
    ['db', 'depot_ip', '192.0.2.1'],
    ['db', 'depot_global', 'tous-les-depots'],
  ])
})
test('une panne ne se transforme pas en autorisation', async () => {
  h.debit.mockRejectedValue(new Error('indisponible'))
  await expect(autoriserAnalyse('dossier')).rejects.toThrow('indisponible')
})
