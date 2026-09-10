import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const doubles = vi.hoisted(() => ({
  contexte: vi.fn(),
  reserver: vi.fn(),
  ouvrir: vi.fn(),
  piece: vi.fn(),
  extraire: vi.fn(),
  configuration: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: doubles.contexte }))
vi.mock('@/lib/coffre/ouverture-supabase', () => ({
  baseOuvertureSupabase: () => ({ piece: doubles.piece }),
}))
vi.mock('@/lib/coffre/ouverture', () => ({
  filigranePour: () => 'Filigrane fictif',
  ouvrirPiecePourLAgence: doubles.ouvrir,
}))
vi.mock('@/lib/ocr/openrouter', () => ({
  configurationOcr: doubles.configuration,
  extraireTexte: doubles.extraire,
}))
import { lirePieceParOcr } from '@/lib/ocr/lecture-agence'
const id = '11111111-1111-4111-8111-111111111111'
const requete = (origin = 'https://cloison.invalid', explicite = 'lecture-explicite') =>
  new Request(`https://cloison.invalid/espace/pieces/${id}`, {
    method: 'POST',
    headers: { origin, 'x-cloison-ocr': explicite },
  })
beforeEach(() => {
  doubles.configuration.mockReturnValue({ cle: 'fictive', modele: 'fictif/modele' })
  doubles.contexte.mockResolvedValue({
    etat: 'rattache',
    email: 'agence@example.invalid',
    supabase: { rpc: doubles.reserver },
  })
  doubles.reserver.mockResolvedValue({ data: true, error: null })
  doubles.ouvrir.mockResolvedValue({ ouverte: true, pdf: Buffer.from('%PDF-fictif') })
  doubles.piece.mockResolvedValue({ dossierId: id })
  doubles.extraire.mockResolvedValue({ pages: [{ page: 1, texte: 'prive' }] })
})
afterEach(() => vi.resetAllMocks())
test.each([
  ['https://tiers.invalid', 'lecture-explicite'],
  ['null', 'lecture-explicite'],
  ['https://cloison.invalid', ''],
])('refuse une requete non explicite de meme origine', async (origine, enTete) => {
  expect((await lirePieceParOcr(requete(origine, enTete), id)).status).toBe(403)
  expect(doubles.contexte).not.toHaveBeenCalled()
  expect(doubles.extraire).not.toHaveBeenCalled()
})
test.each(['anonyme', 'non-rattache'])('aucun appel documentaire pour %s', async (etat) => {
  doubles.contexte.mockResolvedValue({ etat })
  expect((await lirePieceParOcr(requete(), id)).status).toBe(401)
  expect(doubles.reserver).not.toHaveBeenCalled()
  expect(doubles.extraire).not.toHaveBeenCalled()
})
test.each([
  { data: false, error: null },
  { data: null, error: null },
  { data: true, error: {} },
])('quota et journal doivent etre confirmes', async (reservation) => {
  doubles.reserver.mockResolvedValue(reservation)
  expect((await lirePieceParOcr(requete(), id)).status).toBe(404)
  expect(doubles.ouvrir).not.toHaveBeenCalled()
  expect(doubles.extraire).not.toHaveBeenCalled()
})
test('un refus de piece ne parvient pas au fournisseur', async () => {
  doubles.ouvrir.mockResolvedValue({ ouverte: false })
  expect((await lirePieceParOcr(requete(), id)).status).toBe(404)
  expect(doubles.extraire).not.toHaveBeenCalled()
})
test('une revocation pendant le traitement ne rend pas le texte', async () => {
  doubles.piece.mockResolvedValue(null)
  const reponse = await lirePieceParOcr(requete(), id)
  expect(reponse.status).toBe(404)
  expect(await reponse.text()).not.toContain('prive')
})
test('rend une transcription sans cache apres autorisations et journal', async () => {
  const reponse = await lirePieceParOcr(requete(), id)
  expect(reponse.status).toBe(200)
  expect(reponse.headers.get('cache-control')).toBe('no-store')
  expect(doubles.reserver).toHaveBeenCalledWith('reserver_lecture_ocr', { la_piece: id })
  expect(doubles.reserver.mock.invocationCallOrder[0]).toBeLessThan(
    doubles.ouvrir.mock.invocationCallOrder[0]!,
  )
  expect(doubles.ouvrir.mock.invocationCallOrder[0]).toBeLessThan(
    doubles.extraire.mock.invocationCallOrder[0]!,
  )
})
test('absence de configuration, mauvais identifiant et panne restent prives', async () => {
  expect((await lirePieceParOcr(requete(), 'invalide')).status).toBe(404)
  doubles.configuration.mockReturnValue(null)
  expect((await lirePieceParOcr(requete(), id)).status).toBe(503)
  expect(doubles.ouvrir).not.toHaveBeenCalled()
  doubles.configuration.mockReturnValue({ cle: 'fictive' })
  doubles.extraire.mockRejectedValue(new Error('secret-fictif'))
  const reponse = await lirePieceParOcr(requete(), id)
  expect(reponse.status).toBe(503)
  expect(await reponse.text()).not.toContain('secret-fictif')
})
