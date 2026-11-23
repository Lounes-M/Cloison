import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { lireLocationsApimo, versLogement } from '@/lib/logiciels/apimo'

const location = (id: number, plus: Record<string, unknown> = {}) => ({
  id,
  reference: `L${id}`,
  category: 2,
  rooms: 2,
  available_at: '2027-01-15 00:00:00',
  city: { name: ' Lyon ', zipcode: '69004' },
  area: { value: 41.6 },
  price: { value: 850, currency: 'EUR' },
  comments: [{ language: 'fr', title: 'T2  Croix-Rousse' }],
  ...plus,
})
const reponse = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  vi.stubEnv('APIMO_PROVIDER', '1234')
  vi.stubEnv('APIMO_TOKEN', 'jeton-secret')
})
afterEach(() => vi.unstubAllEnvs())

test('un bien a louer devient un logement borne, sans donnee de personne', () => {
  expect(versLogement({ ...location(7), user: { email: 'agent@example.invalid' } })).toEqual({
    reference: '7',
    libelle: 'T2 Croix-Rousse',
    loyer_cents: 85000,
    ville: 'Lyon',
    surface_m2: 42,
    pieces: 2,
    meuble: null,
    disponible_le: '2027-01-15',
  })
})

test('sans titre, le libelle se compose ; hors bornes, la valeur est ecartee', () => {
  expect(
    versLogement(
      location(8, {
        comments: [],
        rooms: 99,
        area: { value: 3 },
        price: { value: 900, currency: 'CHF' },
        available_at: 'bientot',
      }),
    ),
  ).toEqual({
    reference: '8',
    libelle: 'Bien Lyon (réf. L8)',
    loyer_cents: null,
    ville: 'Lyon',
    surface_m2: null,
    pieces: null,
    meuble: null,
    disponible_le: null,
  })
})

test.each([
  ['une vente', location(9, { category: 1 })],
  ['un bien sans identifiant', { category: 2 }],
  ['un identifiant qui ne serait pas un nombre', location(1, { id: '../agencies/2' })],
  ['autre chose qu un objet', 'bien'],
])('%s n est pas importe', (_nom, brut) => {
  expect(versLogement(brut)).toBeNull()
})

test('la lecture suit les pages, n appelle que l hote prevu et ne transmet le jeton qu en en-tete', async () => {
  const pleine = Array.from({ length: 100 }, (_, i) => location(i + 1, { category: i < 3 ? 2 : 1 }))
  const requete = vi
    .fn()
    .mockResolvedValueOnce(reponse({ total_items: 101, properties: pleine }))
    .mockResolvedValueOnce(reponse({ total_items: 101, properties: [location(500)] }))
  const lecture = await lireLocationsApimo('42', { requete })
  expect(lecture.etat).toBe('ok')
  if (lecture.etat !== 'ok') return
  expect(lecture.biens.map((b) => b.reference)).toEqual(['1', '2', '3', '500'])
  expect(lecture.ignores).toBe(97)
  expect(requete.mock.calls.map((c) => String(c[0]))).toEqual([
    'https://api.apimo.pro/agencies/42/properties?limit=100&offset=0',
    'https://api.apimo.pro/agencies/42/properties?limit=100&offset=100',
  ])
  for (const [adresse, options] of requete.mock.calls) {
    expect(String(adresse)).not.toContain('jeton-secret')
    expect(options.redirect).toBe('error')
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from('1234:jeton-secret').toString('base64')}`,
    )
  }
})

test.each([
  [401, 'refuse'],
  [404, 'refuse'],
  [429, 'limite'],
  [500, 'indisponible'],
])('une reponse %i interrompt la lecture sans liste partielle', async (status, etat) => {
  const requete = vi.fn().mockResolvedValue(reponse({}, status))
  expect(await lireLocationsApimo('42', { requete })).toEqual({ etat })
})

test('une reponse illisible, une panne ou un volume excessif ne rendent aucun bien', async () => {
  expect(
    await lireLocationsApimo('42', { requete: vi.fn().mockResolvedValue(reponse({ biens: [] })) }),
  ).toEqual({ etat: 'reponse_invalide' })
  expect(
    await lireLocationsApimo('42', {
      requete: vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })),
    }),
  ).toEqual({ etat: 'reponse_invalide' })
  expect(
    await lireLocationsApimo('42', { requete: vi.fn().mockRejectedValue(new Error('reseau')) }),
  ).toEqual({ etat: 'indisponible' })
  const pleine = Array.from({ length: 100 }, (_, i) => location(i + 1))
  const requete = vi.fn().mockImplementation(async () => reponse({ properties: pleine }))
  expect(await lireLocationsApimo('42', { requete })).toEqual({ etat: 'trop_de_biens' })
})

test('sans identifiants de prestataire ou avec un identifiant d agence douteux, rien n est appele', async () => {
  const requete = vi.fn()
  expect(await lireLocationsApimo('42/../7', { requete })).toEqual({ etat: 'refuse' })
  vi.stubEnv('APIMO_TOKEN', '')
  expect(await lireLocationsApimo('42', { requete })).toEqual({ etat: 'non_configure' })
  expect(requete).not.toHaveBeenCalled()
})
