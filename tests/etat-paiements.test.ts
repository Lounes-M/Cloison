import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GET } from '@/app/api/paiement/etat/route'
import { lireEtatPaiements } from '@/lib/exploitation/paiements.mjs'
const h = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
const etat = {
  version: 1,
  paiements: 1,
  a_reconcilier: 0,
  remboursements: 0,
  rembourse_cents: 0,
  litiges_ouverts: 0,
  litiges_perdus: 0,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'fictif')
  vi.stubEnv('CRON_SUPABASE_SECRET', 'secondaire')
  h.client.mockResolvedValue({ rpc: h.rpc })
  h.rpc.mockResolvedValue({ data: etat, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
test.each(['', 'Bearer secondaire', 'Bearer autre'])(
  'un appel %s ne lit pas le registre',
  async (authorization) => {
    expect(
      (await GET(new Request('https://example.invalid', { headers: { authorization } }))).status,
    ).toBe(401)
    expect(h.client).not.toHaveBeenCalled()
  },
)
test('seuls les compteurs sont restitues sans cache', async () => {
  const reponse = await GET(
    new Request('https://example.invalid', { headers: { authorization: 'Bearer fictif' } }),
  )
  expect(await reponse.json()).toEqual(etat)
  expect(reponse.headers.get('Cache-Control')).toBe('no-store')
})
test('une extension privee du contrat provoque un refus ferme', async () => {
  h.rpc.mockResolvedValue({ data: { ...etat, adresse: 'PRIVE' }, error: null })
  const reponse = await GET(
    new Request('https://example.invalid', { headers: { authorization: 'Bearer fictif' } }),
  )
  expect(reponse.status).toBe(503)
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('PRIVE')
  expect(() => lireEtatPaiements({ ...etat, paiements: -1 })).toThrow()
})
