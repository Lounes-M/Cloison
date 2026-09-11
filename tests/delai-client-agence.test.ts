import { afterEach, expect, test, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({
  env: { supabaseUrl: 'https://fixture.invalid', supabasePublishableKey: 'fixture-publique' },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
import { clientAgence } from '@/lib/acces/agence'
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
test('le vrai SDK agence borne ses requetes Auth', async () => {
  const delai = vi.spyOn(AbortSignal, 'timeout')
  const distant = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    void options
    return new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }))
  })
  vi.stubGlobal('fetch', distant)
  const db = await clientAgence()
  const resultat = await db.auth.getUser('jeton-fictif')
  expect(resultat.error).toBeNull()
  expect(distant).toHaveBeenCalledTimes(1)
  expect(distant.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  expect(delai).toHaveBeenCalledWith(10000)
})
