import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, test, vi } from 'vitest'
import { fetchBorne } from '@/lib/http/fetch-borne'

afterEach(() => vi.restoreAllMocks())

test('le vrai transport coupe un corps HTTP bloque apres reception des entetes', async () => {
  let appels = 0
  const serveur = createServer((_req, res) => {
    appels++
    res.writeHead(200, { 'content-type': 'application/json' })
    res.write('{"incomplet":')
  })
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r))
  const natif = AbortSignal.timeout.bind(AbortSignal)
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    expect(ms).toBe(10000)
    return natif(250)
  })
  let garde: ReturnType<typeof setTimeout>
  try {
    const url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
    const reponse = await fetchBorne(url, { method: 'POST', body: 'fictif' })
    const resultat = await Promise.race([
      reponse.text().then(
        () => 'termine',
        () => 'interrompu',
      ),
      new Promise((r) => {
        garde = setTimeout(() => r('bloque'), 1500)
      }),
    ])
    expect(resultat).toBe('interrompu')
    expect(appels).toBe(1)
  } finally {
    clearTimeout(garde!)
    serveur.closeAllConnections()
    await new Promise<void>((r, reject) => serveur.close((e) => (e ? reject(e) : r())))
  }
})

test('le signal nul explicite conserve tout de meme le budget de phase', async () => {
  const initial = new AbortController(),
    budget = new AbortController()
  let transmis: AbortSignal | null | undefined
  const natif = globalThis.fetch
  try {
    globalThis.fetch = async (_input, options) => {
      transmis = options?.signal
      return new Response()
    }
    await fetchBorne(
      new Request('https://fixture.invalid', { signal: initial.signal }),
      { signal: null },
      budget.signal,
    )
    initial.abort()
    expect(transmis?.aborted).toBe(false)
    budget.abort()
    expect(transmis?.aborted).toBe(true)
    expect(transmis?.reason).toBe(budget.signal.reason)
  } finally {
    globalThis.fetch = natif
  }
})
