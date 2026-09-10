import { expect, test, vi } from 'vitest'
import { lireCorpsWebhook } from '@/lib/http/corps-webhook'

test('un flux interrompu est annule sans restituer un corps partiel', async () => {
  const controle = new AbortController()
  const annuler = vi.fn()
  const corps = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('prive'))
    },
    cancel: annuler,
  })
  const requete = new Request('https://example.invalid', {
    method: 'POST',
    body: corps,
    signal: controle.signal,
    duplex: 'half',
  } as RequestInit)
  const lecture = lireCorpsWebhook(requete)
  controle.abort()
  await expect(lecture).rejects.toThrow()
  expect(annuler).toHaveBeenCalledOnce()
})

test('la limite compte les octets et accepte exactement 64 Kio', async () => {
  for (const [texte, attendu] of [
    ['x'.repeat(65536), true],
    ['é'.repeat(32769), false],
  ] as const) {
    const requete = new Request('https://example.invalid', { method: 'POST', body: texte })
    expect(await lireCorpsWebhook(requete)).toBe(attendu ? texte : null)
  }
})

for (const panne of ['bloquee', 'rejetee'] as const) {
  test(`un corps trop grand est refuse meme si son annulation est ${panne}`, async () => {
    const annuler = vi.fn(() =>
      panne === 'bloquee' ? new Promise<void>(() => {}) : Promise.reject(new Error('prive')),
    )
    const corps = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(65537))
      },
      cancel: annuler,
    })
    const requete = new Request('https://example.invalid', {
      method: 'POST',
      body: corps,
      duplex: 'half',
    } as RequestInit)
    let minuterie: ReturnType<typeof setTimeout> | undefined
    try {
      const resultat = await Promise.race([
        lireCorpsWebhook(requete),
        new Promise<string>((resolve) => {
          minuterie = setTimeout(() => resolve('refus bloque'), 100)
        }),
      ])
      expect(resultat).toBeNull()
      expect(annuler).toHaveBeenCalledOnce()
      expect(corps.locked).toBe(false)
    } finally {
      clearTimeout(minuterie)
    }
  })
}

test('un corps annonce trop grand est annule sans etre lu', async () => {
  const annuler = vi.fn()
  const corps = new ReadableStream<Uint8Array>({ cancel: annuler })
  const requete = new Request('https://example.invalid', {
    method: 'POST',
    headers: { 'content-length': '65537' },
    body: corps,
    duplex: 'half',
  } as RequestInit)
  expect(await lireCorpsWebhook(requete)).toBeNull()
  expect(annuler).toHaveBeenCalledOnce()
  expect(corps.locked).toBe(false)
})
