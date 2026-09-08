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
