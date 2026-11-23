import { afterEach, expect, test, vi } from 'vitest'
import * as en from '@/lib/content/en/ia'
import * as fr from '@/lib/content/ia'
import { traitementsFacultatifs } from '@/lib/juridique/editeur'
import { lien } from '@/lib/i18n'

afterEach(() => vi.unstubAllEnvs())

test('la page existe dans les deux langues', () => {
  expect(lien('en', '/intelligence-artificielle')).toBe('/en/intelligence-artificielle')
})

test('les deux langues decrivent les memes usages, interdits et garanties', () => {
  expect(en.usages.items.map((i) => i.cle)).toEqual(fr.usages.items.map((i) => i.cle))
  expect(en.jamais.cartes).toHaveLength(fr.jamais.cartes.length)
  expect(en.garanties.items.map((i) => i.cle)).toEqual(fr.garanties.items.map((i) => i.cle))
})

test.each([
  ['', '', true],
  ['amazon-bedrock/eu-west-1', '', true],
  ['aucun', '', false],
  ['google-vertex/us', '', false],
  ['aucun', 'eu', true],
])('la lecture en Europe n est affirmee que si elle est imposee : %s %s', (f, region, attendu) => {
  vi.stubEnv('OPENROUTER_EXTRACTION_FOURNISSEUR', f)
  vi.stubEnv('OPENROUTER_REGION', region)
  expect(traitementsFacultatifs().lectureEnEurope).toBe(attendu)
})

test('un usage desactive n est pas annonce comme disponible', () => {
  vi.stubEnv('LECTURE_IA_GARANT', '')
  vi.stubEnv('OCR_ACTIVE', '')
  const f = traitementsFacultatifs()
  expect([f.lectureGarant, f.ocr]).toEqual([false, false])
})
