import { afterEach, expect, test, vi } from 'vitest'
vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'https://fixture.supabase.co',
    supabasePublishableKey: 'fixture',
    supabaseJwtSecret: 'fixture-secret-for-tests-only',
  },
}))
import { clientServeur } from '@/lib/acces/serveur'
import { clientPorteurDeLien } from '@/lib/acces/session'
import { clientStockage } from '@/lib/acces/stockage'
const capacite = {
  dossierId: '11111111-1111-4111-8111-111111111111',
  partie: 'garant' as const,
  jti: '22222222-2222-4222-8222-222222222222',
  expireLe: new Date(Date.now() + 60000),
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const clients = {
  serveur: () => clientServeur(),
  porteur: () => clientPorteurDeLien('fixture-capacite'),
  stockage: () => clientStockage(capacite),
}

test.each(Object.keys(clients) as (keyof typeof clients)[])(
  '%s borne son vrai transport SDK sans rejouer le POST',
  async (nom) => {
    const delai = vi.spyOn(AbortSignal, 'timeout')
    const appel = vi.fn<typeof fetch>(
      async () => new Response('true', { headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', appel)
    const db = await clients[nom]()
    expect((await db.rpc('fixture')).data).toBe(true)
    expect(delai).toHaveBeenCalledWith(10000)
    expect(appel).toHaveBeenCalledTimes(1)
    expect(appel.mock.calls[0]![1]!.method).toBe('POST')
    expect(appel.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal)
  },
)

test.each(Object.keys(clients) as (keyof typeof clients)[])(
  '%s termine sur une reponse dont le corps reste bloque',
  async (nom) => {
    const natif = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => natif(30))
    const appel = vi.fn<typeof fetch>(
      async (_input, options) =>
        new Response(
          new ReadableStream({
            start(controller) {
              options?.signal?.addEventListener(
                'abort',
                () => controller.error(options.signal?.reason),
                { once: true },
              )
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', appel)
    const db = await clients[nom]()
    let garde: ReturnType<typeof setTimeout>
    try {
      const resultat = await Promise.race([
        db.rpc('fixture'),
        new Promise<null>((r) => {
          garde = setTimeout(() => r(null), 300)
        }),
      ])
      expect(resultat).not.toBeNull()
      expect(resultat?.error).toBeTruthy()
      expect(appel).toHaveBeenCalledTimes(1)
    } finally {
      clearTimeout(garde!)
    }
  },
)

test('un budget serveur plus court reste prioritaire', async () => {
  const budget = new AbortController()
  const appel = vi.fn<typeof fetch>(
    async () => new Response('true', { headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', appel)
  const db = await clientServeur(budget.signal)
  await db.rpc('fixture')
  budget.abort()
  expect(appel.mock.calls[0]![1]!.signal?.aborted).toBe(true)
})

test('un upload conserve ses octets et son delai', async () => {
  const delai = vi.spyOn(AbortSignal, 'timeout')
  const appel = vi.fn<typeof fetch>(
    async () =>
      new Response('{"Key":"pieces/fixture"}', { headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', appel)
  const db = await clientStockage(capacite)
  const octets = Buffer.from('contenu-chiffre-fictif')
  await db.storage
    .from('pieces')
    .upload('fixture', octets, { contentType: 'application/octet-stream', upsert: false })
  expect(delai).toHaveBeenCalledWith(10000)
  expect(appel).toHaveBeenCalledTimes(1)
  expect(appel.mock.calls[0]![1]!.body).toEqual(octets)
})
