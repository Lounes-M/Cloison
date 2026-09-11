import { afterEach, expect, test, vi } from 'vitest'
import { fetchAgence } from '@/lib/http/fetch-agence'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
test('un appel recoit un delai fini et conserve son contenu sans reprise', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  const distant = vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    expect(options?.signal?.aborted).toBe(false)
    return new Response('ok')
  })
  vi.stubGlobal('fetch', distant)
  const options = { method: 'POST', headers: { 'x-fixture': 'valeur' }, body: 'charge' }
  expect(await (await fetchAgence('https://fixture.invalid', options)).text()).toBe('ok')
  expect(timeout).toHaveBeenCalledWith(10000)
  expect(distant).toHaveBeenCalledTimes(1)
  expect(distant.mock.calls[0]?.[1]).toMatchObject(options)
  expect(options).not.toHaveProperty('signal')
})
test('le delai interrompt aussi une reponse dont le corps ne termine pas', async () => {
  const natif = AbortSignal.timeout.bind(AbortSignal)
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => natif(20))
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (_input: RequestInfo | URL, options?: RequestInit) =>
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
        ),
    ),
  )
  const resultat = await fetchAgence('https://fixture.invalid')
  const attendu = resultat.text().then(
    () => 'termine',
    () => 'interrompu',
  )
  expect(
    await Promise.race([attendu, new Promise((r) => setTimeout(() => r('bloque'), 100))]),
  ).toBe('interrompu')
})
test.each(['options', 'request'])(
  'l’annulation de l’appelant reste effective : %s',
  async (origine) => {
    const controle = new AbortController()
    let signal: AbortSignal | null | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
        signal = options?.signal
        return new Response()
      }),
    )
    await fetchAgence(
      origine === 'request'
        ? new Request('https://fixture.invalid', { signal: controle.signal })
        : 'https://fixture.invalid',
      origine === 'options' ? { signal: controle.signal } : undefined,
    )
    controle.abort()
    expect(signal?.aborted).toBe(true)
    expect(signal?.reason).toBe(controle.signal.reason)
  },
)
test('une erreur reseau ne provoque aucune reprise implicite', async () => {
  const erreur = new Error('fictif')
  const distant = vi.fn().mockRejectedValue(erreur)
  vi.stubGlobal('fetch', distant)
  await expect(fetchAgence('https://fixture.invalid')).rejects.toBe(erreur)
  expect(distant).toHaveBeenCalledTimes(1)
})

test.each(['remplacement', 'null'])(
  'le signal explicite des options remplace celui de Request : %s',
  async (cas) => {
    const initial = new AbortController()
    const remplacement = new AbortController()
    let signal: AbortSignal | null | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
        signal = options?.signal
        return new Response()
      }),
    )
    await fetchAgence(new Request('https://fixture.invalid', { signal: initial.signal }), {
      signal: cas === 'null' ? null : remplacement.signal,
    })
    initial.abort()
    expect(signal?.aborted).toBe(false)
    remplacement.abort()
    expect(signal?.aborted).toBe(cas !== 'null')
  },
)
