import { beforeEach, expect, test, vi } from 'vitest'
import { remplirLaDemonstration } from '@/lib/agences/demonstration'
const doubles = vi.hoisted(() => ({
  resoudre: vi.fn(),
  stockage: vi.fn(),
  base: vi.fn(),
}))
vi.mock('@/lib/acces/session', () => ({
  emettreLien: async (_id: string, partie: string) => ({ jeton: partie }),
  resoudreCapacite: doubles.resoudre,
  clientPorteurDeLien: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async () => ({ error: null }),
    }),
  }),
}))
vi.mock('@/lib/acces/stockage', () => ({ clientStockage: doubles.stockage }))
vi.mock('@/lib/coffre/depot-supabase', () => ({ baseSupabase: doubles.base }))
vi.mock('@/lib/coffre/depot', () => ({
  deposer: async (base: { serveur: boolean }) => ({ depose: base.serveur }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  doubles.resoudre.mockResolvedValue({ dossierId: 'essai', partie: 'garant', jti: 'fictif' })
  doubles.stockage.mockResolvedValue({ role: 'depot_piece' })
  doubles.base.mockImplementation((_client: unknown, stockage: unknown) => ({
    serveur: Boolean(stockage),
  }))
})
test('la demonstration ne tente pas un upload avec le role public du garant', async () => {
  expect(await remplirLaDemonstration('essai')).toBe(true)
  expect(doubles.stockage).toHaveBeenCalledExactlyOnceWith({
    dossierId: 'essai',
    partie: 'garant',
    jti: 'fictif',
  })
  expect(doubles.base).toHaveBeenCalledWith(expect.anything(), { role: 'depot_piece' })
})
test('une capacite revoquee ne produit aucun client de depot', async () => {
  doubles.resoudre.mockResolvedValue(null)
  expect(await remplirLaDemonstration('essai')).toBe(false)
  expect(doubles.base).not.toHaveBeenCalled()
  expect(doubles.stockage).not.toHaveBeenCalled()
})
