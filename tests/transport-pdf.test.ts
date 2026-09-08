import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ contexte: vi.fn(), ouvrir: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: h.contexte }))
vi.mock('@/lib/coffre/ouverture-supabase', () => ({ baseOuvertureSupabase: () => ({}) }))
vi.mock('@/lib/coffre/ouverture', () => ({
  ouvrirPiecePourLAgence: h.ouvrir,
  filigranePour: () => 'Fixture',
}))
import { GET } from '@/app/(agence)/espace/pieces/[id]/route'
import { NextRequest } from 'next/server'
const id = '11111111-1111-4111-8111-111111111111'
const appeler = () =>
  GET(new NextRequest(`https://example.invalid/espace/pieces/${id}`), {
    params: Promise.resolve({ id }),
  })
beforeEach(() => {
  vi.clearAllMocks()
  h.contexte.mockResolvedValue({ etat: 'rattache', email: 'fixture@example.invalid', supabase: {} })
})
test('un PDF depassant 4,5 Mo est transporte en blocs sans changer les octets', async () => {
  const pdf = Buffer.alloc(6 * 1024 * 1024, 42)
  pdf.write('%PDF-')
  h.ouvrir.mockResolvedValue({ ouverte: true, pdf })
  const reponse = await appeler()
  expect(reponse.status).toBe(200)
  expect(reponse.headers.get('cache-control')).toBe('no-store')
  expect(reponse.headers.get('content-length')).toBeNull()
  const lecteur = reponse.body!.getReader()
  const blocs: Uint8Array[] = []
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    expect(value.length).toBeLessThanOrEqual(64 * 1024)
    blocs.push(value)
  }
  expect(Buffer.concat(blocs).equals(pdf)).toBe(true)
})
test('aucun document sans session agence', async () => {
  h.contexte.mockResolvedValue({ etat: 'anonyme' })
  expect((await appeler()).status).toBe(401)
  expect(h.ouvrir).not.toHaveBeenCalled()
})
test('aucun flux documentaire quand le coffre refuse', async () => {
  h.ouvrir.mockResolvedValue({ ouverte: false, raison: 'Indisponible' })
  expect((await appeler()).status).toBe(404)
})
