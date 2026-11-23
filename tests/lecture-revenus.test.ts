import { afterEach, expect, test, vi } from 'vitest'
import { configurationLectureGarant, lireRevenus } from '@/lib/ocr/extraction-revenus'
import {
  centsEnSaisie,
  normaliserLecture,
  proposerRevenu,
  restitution,
  type DocumentLu,
} from '@/lib/ocr/revenus'

const configuration = {
  cle: 'cle-fictive',
  modele: 'anthropic/claude-opus-5.5',
  fournisseur: 'google-vertex/europe',
  base: 'https://openrouter.ai/api/v1',
}
const pdf = Buffer.from('%PDF-1.7 bulletin fictif')
const bulletin = (periode: string, netPaye: string): DocumentLu => ({
  nature: 'bulletin_paie',
  periode,
  netPaye,
})
const sortie = (
  documents: unknown = [{ nature: 'bulletin_paie', periode: '2026-10', netPaye: '2345.67' }],
  { model = configuration.modele, finish_reason = 'stop' } = {},
) =>
  new Response(
    JSON.stringify({
      model,
      choices: [{ finish_reason, message: { content: JSON.stringify({ documents }) } }],
    }),
  )
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('la proposition fait la moyenne des trois derniers mois de salaire', () => {
  const p = proposerRevenu([
    bulletin('2026-07', '1000.00'),
    bulletin('2026-10', '2000.00'),
    bulletin('2026-09', '2100.00'),
    bulletin('2026-08', '2200.00'),
  ])
  expect(p.salaire).toEqual({
    moyenneCents: 210000,
    periodes: ['2026-08', '2026-09', '2026-10'],
    variable: false,
  })
  expect(p.revenuCents).toBe(210000)
})

test('une periode lue deux fois avec deux montants est ecartee, pas tranchee', () => {
  const p = proposerRevenu([
    bulletin('2026-10', '2000.00'),
    bulletin('2026-10', '2900.00'),
    bulletin('2026-09', '2000.00'),
    bulletin('2026-09', '2000.00'),
  ])
  expect(p.contradictoires).toEqual(['2026-10'])
  expect(p.salaire?.periodes).toEqual(['2026-09'])
})

test('salaire et pension s additionnent ; les montants sans mois ne comptent pas', () => {
  const p = proposerRevenu([
    bulletin('2026-10', '1500.00'),
    bulletin('', '9999.00'),
    { nature: 'pension', periode: '2026-09', netPaye: '800.50' },
    { nature: 'pension', periode: '2026-10', netPaye: '810.50' },
    { nature: 'autre', periode: '2026-10', netPaye: '5000.00' },
  ])
  expect(p.pension).toEqual({ montantCents: 81050, periode: '2026-10' })
  expect(p.revenuCents).toBe(231050)
})

test('des salaires tres variables sont signales', () => {
  const p = proposerRevenu([bulletin('2026-10', '3000.00'), bulletin('2026-09', '2000.00')])
  expect(p.salaire?.variable).toBe(true)
})

test('rien de lisible ne produit aucune proposition', () => {
  expect(proposerRevenu([]).revenuCents).toBeNull()
})

test('les valeurs mal formees deviennent vides au lieu d etre devinees', () => {
  expect(
    normaliserLecture({
      documents: [
        { nature: 'bulletin_paie', periode: '2026-13', netPaye: '2 345,67' },
        { nature: 'bulletin_paie', periode: ' 2026-09 ', netPaye: '2.345,67' },
        { nature: 'pension', periode: 'octobre', netPaye: '-12.00' },
      ],
    }),
  ).toEqual([
    { nature: 'bulletin_paie', periode: '', netPaye: '2345.67' },
    { nature: 'bulletin_paie', periode: '2026-09', netPaye: '' },
    { nature: 'pension', periode: '', netPaye: '' },
  ])
  expect(() => normaliserLecture({ documents: [], nom: 'Dupont' })).toThrow()
  expect(() =>
    normaliserLecture({
      documents: [{ nature: 'bulletin_paie', periode: '', netPaye: '', iban: 'FR76' }],
    }),
  ).toThrow()
})

test('le report reprend le format que le champ revenu accepte', () => {
  expect(centsEnSaisie(234567)).toBe('2345,67')
  expect(centsEnSaisie(320000)).toBe('3200')
  expect(centsEnSaisie(320005)).toBe('3200,05')
})

test('la restitution refuse tout champ supplementaire', () => {
  const valide = {
    proposition: proposerRevenu([bulletin('2026-10', '2000.00')]),
    illisibles: 0,
    modele: configuration.modele,
  }
  expect(restitution.parse(valide)).toEqual(valide)
  expect(() => restitution.parse({ ...valide, texte: 'prive' })).toThrow()
})

test('reste desactivee sans activation explicite et cle', () => {
  vi.stubEnv('LECTURE_IA_GARANT', '')
  vi.stubEnv('OPENROUTER_API_KEY', 'cle')
  expect(configurationLectureGarant()).toBeNull()
  vi.stubEnv('LECTURE_IA_GARANT', 'true')
  vi.stubEnv('OPENROUTER_API_KEY', '')
  expect(configurationLectureGarant()).toBeNull()
  vi.stubEnv('OPENROUTER_API_KEY', 'cle')
  vi.stubEnv('OPENROUTER_EXTRACTION_MODEL', '')
  vi.stubEnv('OPENROUTER_EXTRACTION_FOURNISSEUR', '')
  vi.stubEnv('OPENROUTER_REGION', '')
  expect(configurationLectureGarant()).toEqual({ ...configuration, cle: 'cle' })
  vi.stubEnv('OPENROUTER_EXTRACTION_FOURNISSEUR', 'aucun')
  vi.stubEnv('OPENROUTER_REGION', 'eu')
  expect(configurationLectureGarant()).toMatchObject({
    fournisseur: null,
    base: 'https://eu.openrouter.ai/api/v1',
  })
  vi.stubEnv('OPENROUTER_EXTRACTION_MODEL', 'https://evil.invalid/x')
  expect(configurationLectureGarant()).toBeNull()
})

test('la demande impose ZDR, refus de collecte, endpoint choisi et sortie fermee', async () => {
  const appel = vi.fn().mockResolvedValue(sortie())
  vi.stubGlobal('fetch', appel)
  expect(await lireRevenus(pdf, 'application/pdf', configuration)).toEqual([
    { nature: 'bulletin_paie', periode: '2026-10', netPaye: '2345.67' },
  ])
  const [url, options] = appel.mock.calls[0]!
  expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
  const corps = JSON.parse(options.body)
  expect(corps.provider).toEqual({
    zdr: true,
    data_collection: 'deny',
    require_parameters: true,
    allow_fallbacks: false,
    only: ['google-vertex/europe'],
  })
  expect(corps.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }])
  expect(corps.response_format.json_schema.strict).toBe(true)
  expect(corps.messages[1].content[0].file.filename).toBe('justificatif.pdf')
  expect(corps.tools).toBeUndefined()
  expect(options.redirect).toBe('error')
})

test('une image part en image, sans greffon PDF', async () => {
  const appel = vi.fn().mockResolvedValue(sortie())
  vi.stubGlobal('fetch', appel)
  await lireRevenus(Buffer.from('jpeg'), 'image/jpeg', { ...configuration, fournisseur: null })
  const corps = JSON.parse(appel.mock.calls[0]![1].body)
  expect(corps.plugins).toBeUndefined()
  expect(corps.provider.only).toBeUndefined()
  expect(corps.messages[1].content[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
})

test('accepte la version datee du modele demande, refuse un autre modele', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(sortie(undefined, { model: `${configuration.modele}-20260921` })),
  )
  await expect(lireRevenus(pdf, 'application/pdf', configuration)).resolves.toHaveLength(1)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sortie(undefined, { model: 'autre/modele' })))
  await expect(lireRevenus(pdf, 'application/pdf', configuration)).rejects.toThrow(
    'Lecture des revenus indisponible',
  )
})

test.each([
  ['sortie tronquee', () => sortie(undefined, { finish_reason: 'length' })],
  ['statut en erreur', () => new Response('{}', { status: 500 })],
  ['reponse trop grande', () => new Response('x'.repeat(70000))],
  [
    'champ libre ajoute',
    () => sortie([{ nature: 'bulletin_paie', periode: '', netPaye: '', nom: 'X' }]),
  ],
])('refuse : %s', async (_cas, reponse) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse()))
  await expect(lireRevenus(pdf, 'application/pdf', configuration)).rejects.toThrow(
    'Lecture des revenus indisponible',
  )
})

test('un type inconnu ou un fichier trop lourd ne part pas', async () => {
  const appel = vi.fn()
  vi.stubGlobal('fetch', appel)
  await expect(lireRevenus(pdf, 'text/html', configuration)).rejects.toThrow()
  await expect(
    lireRevenus(Buffer.alloc(8 * 1024 * 1024 + 1), 'application/pdf', configuration),
  ).rejects.toThrow()
  expect(appel).not.toHaveBeenCalled()
})
