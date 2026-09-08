import { afterEach, expect, test, vi } from 'vitest'
vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'https://fixture.supabase.co',
    supabasePublishableKey: 'fixture',
    supabaseJwtSecret: 'fixture-secret-for-tests-only',
  },
}))
import { clientServeur } from '@/lib/acces/serveur'
afterEach(() => vi.unstubAllGlobals())
test('le signal du budget annule aussi le transport Supabase', async () => {
  const appel = vi.fn<typeof fetch>(
    async () => new Response('true', { headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', appel)
  const controleur = new AbortController()
  const db = await clientServeur(controleur.signal)
  await db.rpc('fixture')
  const options = appel.mock.calls[0]?.[1] as RequestInit | undefined
  expect(options?.signal).toBeInstanceOf(AbortSignal)
  controleur.abort()
  expect(options?.signal?.aborted).toBe(true)
})
