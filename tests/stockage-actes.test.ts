import { randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { stockageActe } from '@/lib/signature/stockage-actes'
import { empreintePdf, type FichierActe } from '@/lib/signature/archive-format'
vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'https://storage.example.invalid',
    supabasePublishableKey: 'fixture',
    supabaseJwtSecret: 'fixture-sans-valeur-secrete',
  },
}))
const pdf = Buffer.from('%PDF-1.7 fictif'),
  ref: FichierActe = {
    id: randomUUID(),
    acte_id: randomUUID(),
    nature: 'acte',
    taille: pdf.length,
    empreinte: empreintePdf(pdf),
    nonce: `\\x${randomBytes(12).toString('hex')}`,
    confirme: true,
  }
const fetcher = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockReset()
})
afterEach(() => vi.unstubAllGlobals())
test('lit uniquement le chemin chiffre borne et refuse les redirections', async () => {
  const octets = Buffer.alloc(pdf.length + 16, 9)
  fetcher.mockResolvedValue(new Response(octets))
  const s = await stockageActe(ref, AbortSignal.timeout(1000))
  expect(await s.lire()).toEqual(octets)
  expect(fetcher).toHaveBeenCalledWith(
    `https://storage.example.invalid/storage/v1/object/authenticated/actes/${ref.acte_id}/${ref.id}`,
    expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
  )
})
test('arrete un corps trop grand sans lire le reste', async () => {
  const annuler = vi.fn()
  fetcher.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(pdf.length + 17))
        },
        cancel: annuler,
      }),
    ),
  )
  const s = await stockageActe(ref, AbortSignal.timeout(1000))
  await expect(s.lire()).rejects.toThrow('Archive invalide')
  expect(annuler).toHaveBeenCalled()
})
test('refuse les corps tronques et les erreurs fournisseur', async () => {
  const s = await stockageActe(ref, AbortSignal.timeout(1000))
  fetcher.mockResolvedValue(new Response(Buffer.alloc(8)))
  await expect(s.lire()).rejects.toThrow('Archive invalide')
  fetcher.mockResolvedValue(new Response('panne', { status: 503 }))
  await expect(s.lire()).rejects.toThrow('Archive indisponible')
})
test('une requete abandonnee ne lance aucun telechargement', async () => {
  const controle = new AbortController()
  controle.abort()
  const s = await stockageActe(ref, controle.signal)
  await expect(s.lire()).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})
