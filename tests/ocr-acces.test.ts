import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
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
  doubles.ouvrir.mockResolvedValue({ ouverte: true, pdf: Buffer.from('%PDF-fictif'), pages: 1 })
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
  expect(doubles.extraire).not.toHaveBeenCalled()
})

test('une revocation apres le fournisseur ne rend pas la transcription', async () => {
  doubles.piece.mockResolvedValueOnce({ dossierId: id }).mockResolvedValueOnce(null)
  const reponse = await lirePieceParOcr(requete(), id)
  expect(reponse.status).toBe(404)
  expect(await reponse.text()).not.toContain('prive')
  expect(doubles.extraire).toHaveBeenCalledTimes(1)
})

test('la selection ne transmet que les pages demandees et restitue leur numero original', async () => {
  const source = await PDFDocument.create()
  for (const largeur of [101, 202, 303]) source.addPage([largeur, 400])
  doubles.ouvrir.mockResolvedValue({
    ouverte: true,
    pdf: Buffer.from(await source.save()),
    pages: 3,
  })
  doubles.extraire.mockResolvedValue({ pages: [{ page: 1, texte: 'selection' }] })
  const r = requete()
  r.headers.set('x-cloison-ocr-pages', '3')
  const reponse = await lirePieceParOcr(r, id)
  expect(reponse.status).toBe(200)
  expect((await reponse.json()).pages).toEqual([{ page: 3, texte: 'selection' }])
  const envoye = await PDFDocument.load(doubles.extraire.mock.calls[0]![0])
  expect(envoye.getPages().map((p) => p.getWidth())).toEqual([303])
  expect(doubles.extraire.mock.calls[0]![2]).toBe(1)
})

test.each(['0', '41', '2-1', '1,'])(
  'une selection invalide ne consomme pas le quota : %s',
  async (pages) => {
    const r = requete()
    r.headers.set('x-cloison-ocr-pages', pages)
    expect((await lirePieceParOcr(r, id)).status).toBe(400)
    expect(doubles.reserver).not.toHaveBeenCalled()
    expect(doubles.extraire).not.toHaveBeenCalled()
  },
)

test('une page absente ou une interruption avant envoi ne parvient pas au fournisseur', async () => {
  const r = requete()
  r.headers.set('x-cloison-ocr-pages', '2')
  expect((await lirePieceParOcr(r, id)).status).toBe(400)
  expect(doubles.extraire).not.toHaveBeenCalled()
  const annulee = new Request(requete(), { signal: AbortSignal.abort() })
  expect((await lirePieceParOcr(annulee, id)).status).toBe(503)
  expect(doubles.extraire).not.toHaveBeenCalled()
})
test('rend une transcription sans cache apres autorisations et journal', async () => {
  const reponse = await lirePieceParOcr(requete(), id)
  expect(reponse.status).toBe(200)
  expect(reponse.headers.get('cache-control')).toBe('no-store')
  expect(doubles.reserver).toHaveBeenCalledWith('reserver_lecture_ocr', { la_piece: id })
  expect(doubles.ouvrir).toHaveBeenCalledWith(expect.anything(), id, 'Filigrane fictif', true)
  expect(doubles.extraire).toHaveBeenCalledWith(
    Buffer.from('%PDF-fictif'),
    expect.anything(),
    1,
    expect.any(AbortSignal),
  )
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
