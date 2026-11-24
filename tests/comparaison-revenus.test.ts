import { afterEach, expect, test, vi } from 'vitest'
import { comparaisonRevenus, comparerAuxPieces } from '@/lib/ocr/comparaison'
import {
  configurationComparaisonAgence,
  configurationLectureGarant,
} from '@/lib/ocr/extraction-revenus'
import { proposerRevenu, type DocumentLu } from '@/lib/ocr/revenus'

afterEach(() => vi.unstubAllEnvs())

const bulletin = (periode: string, netPaye: string): DocumentLu => ({
  nature: 'bulletin_paie',
  periode,
  netPaye,
})
const lu2000 = proposerRevenu([bulletin('2026-10', '2000.00')])

test.each([
  [200000, 'concordant', 0, 0],
  // La tolerance est de 5 % du montant lu, bornes comprises.
  [210000, 'concordant', 10000, 5],
  [190000, 'concordant', -10000, 5],
  [210001, 'superieur', 10001, 5],
  [189999, 'inferieur', -10001, 5],
  [300000, 'superieur', 100000, 50],
  [100000, 'inferieur', -100000, 50],
])('une declaration de %i centimes face a 2 000 euros lus : %s', (declare, etat, ecart, pc) => {
  expect(comparerAuxPieces(declare, lu2000)).toEqual({
    etat,
    ecartCents: ecart,
    ecartPourCent: pc,
  })
})

test('rien de lisible n est ni un ecart ni une concordance', () => {
  expect(comparerAuxPieces(200000, proposerRevenu([]))).toEqual({
    etat: 'illisible',
    ecartCents: null,
    ecartPourCent: null,
  })
})

test('salaire et pension s additionnent avant la comparaison', () => {
  const lecture = proposerRevenu([
    bulletin('2026-08', '1000.00'),
    bulletin('2026-09', '1000.00'),
    bulletin('2026-10', '1000.00'),
    { nature: 'pension', periode: '2026-10', netPaye: '500.00' },
  ])
  expect(comparerAuxPieces(150000, lecture).etat).toBe('concordant')
  expect(comparerAuxPieces(250000, lecture)).toMatchObject({ etat: 'superieur', ecartPourCent: 67 })
})

test('la reponse est fermee : ni champ en plus, ni etat incoherent', () => {
  const valide = {
    ...comparerAuxPieces(250000, lu2000),
    declareCents: 250000,
    lecture: lu2000,
    pieces: 1,
    illisibles: 0,
    modele: 'anthropic/claude-opus-5.5',
  }
  expect(comparaisonRevenus.parse(valide)).toEqual(valide)
  expect(() => comparaisonRevenus.parse({ ...valide, nom: 'prive' })).toThrow()
  expect(() => comparaisonRevenus.parse({ ...valide, score: 80 })).toThrow()
  expect(() => comparaisonRevenus.parse({ ...valide, etat: 'illisible' })).toThrow()
  expect(() => comparaisonRevenus.parse({ ...valide, ecartCents: null })).toThrow()
  expect(() => comparaisonRevenus.parse({ ...valide, pieces: 5 })).toThrow()
})

test('la comparaison s active a part de la lecture du garant', () => {
  vi.stubEnv('OPENROUTER_API_KEY', 'cle')
  vi.stubEnv('OPENROUTER_EXTRACTION_MODEL', '')
  vi.stubEnv('OPENROUTER_EXTRACTION_FOURNISSEUR', '')
  vi.stubEnv('OPENROUTER_REGION', '')
  vi.stubEnv('LECTURE_IA_GARANT', 'true')
  vi.stubEnv('COMPARAISON_IA_AGENCE', '')
  expect(configurationComparaisonAgence()).toBeNull()
  vi.stubEnv('LECTURE_IA_GARANT', '')
  vi.stubEnv('COMPARAISON_IA_AGENCE', 'true')
  expect(configurationLectureGarant()).toBeNull()
  expect(configurationComparaisonAgence()).toEqual({
    cle: 'cle',
    modele: 'anthropic/claude-opus-5.5',
    fournisseur: 'google-vertex/europe',
    base: 'https://openrouter.ai/api/v1',
  })
  vi.stubEnv('OPENROUTER_API_KEY', '')
  expect(configurationComparaisonAgence()).toBeNull()
})
