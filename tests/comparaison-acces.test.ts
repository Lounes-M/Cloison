import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const doubles = vi.hoisted(() => ({
  contexte: vi.fn(),
  reserver: vi.fn(),
  ouvrir: vi.fn(),
  piece: vi.fn(),
  lire: vi.fn(),
  configuration: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: doubles.contexte }))
vi.mock('@/lib/coffre/ouverture-supabase', () => ({
  baseOuvertureSupabase: () => ({ piece: doubles.piece }),
}))
vi.mock('@/lib/coffre/ouverture', () => ({
  filigranePour: (qui: string) => `${qui} - filigrane`,
  ouvrirPiecePourLAgence: doubles.ouvrir,
}))
vi.mock('@/lib/ocr/extraction-revenus', () => ({
  configurationComparaisonAgence: doubles.configuration,
  lireRevenus: doubles.lire,
}))
import { comparerRevenusPour } from '@/lib/ocr/comparaison-agence'

const dossier = '22222222-2222-4222-8222-222222222222'
const p1 = '11111111-1111-4111-8111-111111111111'
const p2 = '33333333-3333-4333-8333-333333333333'
const requete = (origin = 'https://cloison.invalid', explicite = 'revenus-explicite') =>
  new Request(`https://cloison.invalid/espace/dossiers/${dossier}/comparaison`, {
    method: 'POST',
    headers: { origin, 'x-cloison-comparaison': explicite },
  })
const copie = Buffer.from('%PDF-copie-filigranee')

beforeEach(() => {
  doubles.configuration.mockReturnValue({ cle: 'fictive', modele: 'fictif/modele' })
  doubles.contexte.mockResolvedValue({
    etat: 'rattache',
    email: 'agence@example.invalid',
    supabase: { rpc: doubles.reserver },
  })
  doubles.reserver.mockResolvedValue({
    data: { declare_cents: 300000, pieces: [p1, p2] },
    error: null,
  })
  doubles.ouvrir.mockResolvedValue({ ouverte: true, pdf: copie })
  doubles.piece.mockResolvedValue({ dossierId: dossier })
  doubles.lire
    .mockResolvedValueOnce([{ nature: 'bulletin_paie', periode: '2026-10', netPaye: '2000.00' }])
    .mockResolvedValueOnce([{ nature: 'pension', periode: '2026-10', netPaye: '500.00' }])
})
afterEach(() => vi.resetAllMocks())

test('une comparaison reservee rend l ecart et le detail lu, sans cache', async () => {
  const reponse = await comparerRevenusPour(requete(), dossier)
  expect(reponse.status).toBe(200)
  expect(reponse.headers.get('cache-control')).toBe('no-store')
  expect(await reponse.json()).toEqual({
    etat: 'superieur',
    ecartCents: 50000,
    ecartPourCent: 20,
    declareCents: 300000,
    lecture: {
      revenuCents: 250000,
      salaire: { moyenneCents: 200000, periodes: ['2026-10'], variable: false },
      pension: { montantCents: 50000, periode: '2026-10' },
      contradictoires: [],
    },
    pieces: 2,
    illisibles: 0,
    modele: 'fictif/modele',
  })
  expect(doubles.reserver).toHaveBeenCalledExactlyOnceWith('reserver_comparaison_revenus', {
    le_dossier: dossier,
  })
})

test('seule la copie filigranee de l agence part chez le fournisseur', async () => {
  await comparerRevenusPour(requete(), dossier)
  expect(doubles.ouvrir.mock.calls.map((a) => [a[1], a[2]])).toEqual([
    [p1, 'agence@example.invalid - filigrane'],
    [p2, 'agence@example.invalid - filigrane'],
  ])
  for (const appel of doubles.lire.mock.calls) {
    expect(appel[0]).toBe(copie)
    expect(appel[1]).toBe('application/pdf')
  }
})

test.each([
  ['https://tiers.invalid', 'revenus-explicite'],
  ['null', 'revenus-explicite'],
  ['https://cloison.invalid', ''],
])('refuse une requete non explicite de meme origine', async (origine, enTete) => {
  expect((await comparerRevenusPour(requete(origine, enTete), dossier)).status).toBe(403)
  expect(doubles.contexte).not.toHaveBeenCalled()
})

test('sans activation explicite, rien n est reserve ni lu', async () => {
  doubles.configuration.mockReturnValue(null)
  expect((await comparerRevenusPour(requete(), dossier)).status).toBe(503)
  expect(doubles.contexte).not.toHaveBeenCalled()
  expect(doubles.ouvrir).not.toHaveBeenCalled()
})

test('un identifiant qui n est pas un UUID ne touche a rien', async () => {
  expect((await comparerRevenusPour(requete(), 'pas-un-uuid')).status).toBe(404)
  expect(doubles.contexte).not.toHaveBeenCalled()
})

test.each(['anonyme', 'non-rattache'])('aucune lecture pour %s', async (etat) => {
  doubles.contexte.mockResolvedValue({ etat })
  expect((await comparerRevenusPour(requete(), dossier)).status).toBe(401)
  expect(doubles.reserver).not.toHaveBeenCalled()
})

test.each([
  { data: null, error: null },
  { data: { declare_cents: 300000, pieces: [p1] }, error: {} },
  { data: { declare_cents: 300000, pieces: [] }, error: null },
  { data: { declare_cents: 0, pieces: [p1] }, error: null },
  { data: { declare_cents: 300000, pieces: ['ailleurs'] }, error: null },
  { data: { declare_cents: 300000, pieces: [p1, p2, p1, p2, p1] }, error: null },
])('sans reservation conforme, aucune piece n est ouverte ni envoyee', async (r) => {
  doubles.reserver.mockResolvedValue(r)
  expect((await comparerRevenusPour(requete(), dossier)).status).toBe(404)
  expect(doubles.ouvrir).not.toHaveBeenCalled()
  expect(doubles.lire).not.toHaveBeenCalled()
})

test('un acces retire pendant la rasterisation n envoie rien au fournisseur', async () => {
  doubles.piece.mockResolvedValue(null)
  expect((await comparerRevenusPour(requete(), dossier)).status).toBe(404)
  expect(doubles.lire).not.toHaveBeenCalled()
})

test('un acces retire pendant la lecture ne recoit pas le resultat', async () => {
  doubles.piece.mockResolvedValueOnce({ dossierId: dossier }).mockResolvedValueOnce(null)
  const reponse = await comparerRevenusPour(requete(), dossier)
  expect(reponse.status).toBe(404)
  expect(await reponse.json()).toBeNull()
})

test('une piece illisible est comptee, et la comparaison porte sur le reste', async () => {
  doubles.ouvrir
    .mockResolvedValueOnce({ ouverte: true, pdf: copie })
    .mockResolvedValueOnce({ ouverte: false, raison: 'indisponible' })
  const reponse = await comparerRevenusPour(requete(), dossier)
  expect(await reponse.json()).toMatchObject({
    etat: 'superieur',
    ecartCents: 100000,
    illisibles: 1,
    pieces: 2,
  })
  expect(doubles.lire).toHaveBeenCalledOnce()
})

test('aucune piece lue est une indisponibilite, pas un constat', async () => {
  doubles.lire.mockReset()
  doubles.lire.mockRejectedValue(new Error('contenu prive fictif'))
  const reponse = await comparerRevenusPour(requete(), dossier)
  expect(reponse.status).toBe(503)
  expect(await reponse.text()).toBe('null')
})

test('des pieces lues sans montant exploitable rendent un etat illisible', async () => {
  doubles.lire.mockReset()
  doubles.lire.mockResolvedValue([{ nature: 'autre', periode: '', netPaye: '' }])
  expect(await (await comparerRevenusPour(requete(), dossier)).json()).toMatchObject({
    etat: 'illisible',
    ecartCents: null,
    lecture: { revenuCents: null },
  })
})
