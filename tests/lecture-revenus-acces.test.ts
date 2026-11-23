import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const doubles = vi.hoisted(() => ({
  capacite: vi.fn(),
  rpc: vi.fn(),
  pieces: vi.fn(),
  original: vi.fn(),
  lire: vi.fn(),
  configuration: vi.fn(),
}))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: doubles.capacite,
  clientPorteurDeLien: () => ({
    rpc: doubles.rpc,
    from: () => {
      const chaine = {
        select: () => chaine,
        eq: () => chaine,
        in: () => chaine,
        order: () => chaine,
        limit: doubles.pieces,
      }
      return chaine
    },
  }),
}))
vi.mock('@/lib/garant/original', () => ({ lireOriginalGarant: doubles.original }))
vi.mock('@/lib/ocr/extraction-revenus', () => ({
  configurationLectureGarant: doubles.configuration,
  lireRevenus: doubles.lire,
}))
import { lireRevenusDuGarant } from '@/lib/garant/lecture-revenus'

const dossier = '22222222-2222-4222-8222-222222222222'
const p1 = '11111111-1111-4111-8111-111111111111'
const p2 = '33333333-3333-4333-8333-333333333333'
const requete = ({
  origin = 'https://cloison.invalid',
  explicite = 'revenus-explicite',
  dossierPage = dossier,
} = {}) =>
  new Request('https://cloison.invalid/garant/lecture', {
    method: 'POST',
    headers: { origin, 'x-cloison-lecture': explicite, 'x-cloison-dossier': dossierPage },
  })
beforeEach(() => {
  doubles.configuration.mockReturnValue({ cle: 'fictive', modele: 'fictif/modele' })
  doubles.capacite.mockResolvedValue({
    jeton: 'jeton',
    capacite: { partie: 'garant', dossierId: dossier },
  })
  doubles.pieces.mockResolvedValue({
    data: [
      { id: p1, type: 'bulletin_paie' },
      { id: p2, type: 'pension_retraite' },
    ],
    error: null,
  })
  doubles.rpc.mockResolvedValue({ data: true, error: null })
  doubles.original.mockResolvedValue({ contenu: Buffer.from('%PDF'), typeReel: 'application/pdf' })
  doubles.lire
    .mockResolvedValueOnce([{ nature: 'bulletin_paie', periode: '2026-10', netPaye: '2000.00' }])
    .mockResolvedValueOnce([{ nature: 'pension', periode: '2026-10', netPaye: '500.00' }])
})
afterEach(() => vi.resetAllMocks())

test('rend une proposition sans rien ecrire, apres reservation de chaque fichier', async () => {
  const reponse = await lireRevenusDuGarant(requete())
  expect(reponse.status).toBe(200)
  expect(reponse.headers.get('cache-control')).toBe('no-store')
  const corps = await reponse.json()
  expect(corps.proposition.revenuCents).toBe(250000)
  expect(corps.illisibles).toBe(0)
  expect(JSON.stringify(corps)).not.toContain('PDF')
  expect(doubles.rpc.mock.calls).toEqual([
    ['reserver_lecture_ia_garant', { la_piece: p1 }],
    ['reserver_lecture_ia_garant', { la_piece: p2 }],
  ])
  // Pas de seconde ligne « piece ouverte » : la reservation est la trace.
  expect(doubles.original).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    p1,
    8 * 1024 * 1024,
    false,
  )
  expect(doubles.rpc.mock.invocationCallOrder[1]).toBeLessThan(
    doubles.original.mock.invocationCallOrder[0]!,
  )
})

test.each([
  [{ origin: 'https://tiers.invalid' }, 403],
  [{ explicite: '' }, 403],
  [{ dossierPage: 'pas-un-uuid' }, 400],
])('refuse une requete non explicite : %o', async (options, statut) => {
  expect((await lireRevenusDuGarant(requete(options))).status).toBe(statut)
  expect(doubles.capacite).not.toHaveBeenCalled()
  expect(doubles.lire).not.toHaveBeenCalled()
})

test('desactivee, rien n est lu', async () => {
  doubles.configuration.mockReturnValue(null)
  expect((await lireRevenusDuGarant(requete())).status).toBe(503)
  expect(doubles.capacite).not.toHaveBeenCalled()
})

test('le locataire ou un autre dossier ne declenche rien', async () => {
  doubles.capacite.mockResolvedValue({
    jeton: 'jeton',
    capacite: { partie: 'locataire', dossierId: dossier },
  })
  expect((await lireRevenusDuGarant(requete())).status).toBe(401)
  doubles.capacite.mockResolvedValue({
    jeton: 'jeton',
    capacite: { partie: 'garant', dossierId: p1 },
  })
  expect((await lireRevenusDuGarant(requete())).status).toBe(409)
  expect(doubles.rpc).not.toHaveBeenCalled()
})

test('un quota atteint n envoie aucun fichier', async () => {
  doubles.rpc.mockResolvedValueOnce({ data: true, error: null })
  doubles.rpc.mockResolvedValueOnce({ data: false, error: null })
  expect((await lireRevenusDuGarant(requete())).status).toBe(429)
  expect(doubles.original).not.toHaveBeenCalled()
  expect(doubles.lire).not.toHaveBeenCalled()
})

test('aucun justificatif de revenus : rien a lire', async () => {
  doubles.pieces.mockResolvedValue({ data: [], error: null })
  expect((await lireRevenusDuGarant(requete())).status).toBe(404)
  expect(doubles.rpc).not.toHaveBeenCalled()
})

test('un fichier illisible est compte, sans faire echouer les autres', async () => {
  doubles.lire.mockReset()
  doubles.lire
    .mockRejectedValueOnce(new Error('secret-fournisseur'))
    .mockResolvedValueOnce([{ nature: 'pension', periode: '2026-10', netPaye: '500.00' }])
  const reponse = await lireRevenusDuGarant(requete())
  const corps = await reponse.json()
  expect(corps.illisibles).toBe(1)
  expect(corps.proposition.revenuCents).toBe(50000)
  expect(JSON.stringify(corps)).not.toContain('secret')
})

test('tous illisibles : panne generique', async () => {
  doubles.lire.mockReset()
  doubles.lire.mockRejectedValue(new Error('secret-fournisseur'))
  const reponse = await lireRevenusDuGarant(requete())
  expect(reponse.status).toBe(503)
  expect(await reponse.text()).not.toContain('secret')
})
