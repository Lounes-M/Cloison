import { afterEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
import { GET } from '@/app/api/maintenance/etat/route'
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})
test('le jeton secondaire ne lit pas l etat ni les autres routes', async () => {
  vi.stubEnv('CRON_SECRET', 'premier')
  vi.stubEnv('CRON_SUPABASE_SECRET', 'second')
  expect(
    (
      await GET(
        new Request('https://example.test/api/maintenance/etat', {
          headers: { authorization: 'Bearer second' },
        }),
      )
    ).status,
  ).toBe(401)
  expect(h.client).not.toHaveBeenCalled()
})
test('une panne de lecture ne retourne pas un etat vide reussi', async () => {
  vi.stubEnv('CRON_SECRET', 'premier')
  h.client.mockResolvedValue({ rpc: async () => ({ error: { message: 'secret' }, data: null }) })
  const reponse = await GET(
    new Request('https://example.test/api/maintenance/etat', {
      headers: { authorization: 'Bearer premier' },
    }),
  )
  expect(reponse.status).toBe(503)
  expect(await reponse.json()).toEqual({ disponible: false })
})
