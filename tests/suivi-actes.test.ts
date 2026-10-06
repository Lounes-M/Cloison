import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), executer: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
import { suivreTraitementActes } from '@/lib/exploitation/suivi-actes'
import { GET } from '@/app/api/actes/etat/route'
const requete = (secret = 'dedie') =>
  new Request('https://example.invalid', { headers: { authorization: `Bearer ${secret}` } })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'global')
  vi.stubEnv('CRON_ACTES_SECRET', 'dedie')
  vi.stubEnv('CRON_SUPABASE_SECRET', 'maintenance')
  h.client.mockResolvedValue({ rpc: h.rpc })
  h.rpc.mockResolvedValue({ data: true, error: null })
  h.executer.mockImplementation(async () => new Response('{}', { status: 200 }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
test.each(['dedie', 'global'])(
  'le secret autorise %s confirme seulement apres execution',
  async (secret) => {
    const r = await suivreTraitementActes('archives', requete(secret), h.executer)
    expect(r.status).toBe(200)
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('confirmer_traitement_actes', {
      le_nom: 'archives',
      reussite: true,
    })
    expect(h.executer.mock.invocationCallOrder[0]).toBeLessThan(h.rpc.mock.invocationCallOrder[0]!)
  },
)
test.each(['maintenance', 'invalide'])(
  'un autre secret refuse sans traitement ni SQL %s',
  async (secret) => {
    expect((await suivreTraitementActes('archives', requete(secret), h.executer)).status).toBe(401)
    expect(h.executer).not.toHaveBeenCalled()
    expect(h.client).not.toHaveBeenCalled()
  },
)
test('une confirmation absente ne produit pas de faux succes', async () => {
  h.rpc.mockResolvedValue({ data: false, error: null })
  expect((await suivreTraitementActes('archives', requete(), h.executer)).status).toBe(503)
})
test('un traitement en echec est enregistre comme tel sans detail prive', async () => {
  h.executer.mockRejectedValue(new Error('PRIVE'))
  const r = await suivreTraitementActes('archives', requete(), h.executer)
  expect(r.status).toBe(503)
  expect(await r.text()).not.toContain('PRIVE')
  expect(h.rpc).toHaveBeenCalledWith('confirmer_traitement_actes', {
    le_nom: 'archives',
    reussite: false,
  })
})
test('le secret dedie ne lit pas la supervision', async () => {
  expect((await GET(requete())).status).toBe(401)
  expect(h.client).not.toHaveBeenCalled()
})
test('la supervision refuse un rapport incomplet', async () => {
  h.rpc.mockResolvedValue({ data: {}, error: null })
  const r = await GET(requete('global'))
  expect(r.status).toBe(503)
  expect(r.headers.get('cache-control')).toBe('no-store')
})
