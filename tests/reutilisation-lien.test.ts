import { expect, test } from 'vitest'
import { jetonDuLienSource } from '@/lib/garant/lien-source'
import { site } from '@/lib/site'
test('accepte seulement le lien absolu du site sans transport reseau', () => {
  expect(jetonDuLienSource(site.url + '/lien/aaa.bbb.ccc')).toBe('aaa.bbb.ccc')
})
test.each([
  null,
  '',
  'aaa.bbb.ccc',
  '/lien/aaa.bbb.ccc',
  'https://tiers.invalid/lien/aaa.bbb.ccc',
  site.url + '/lien/aaa.bbb.ccc?copie=1',
  site.url + '/lien/aaa.bbb.ccc#fuite',
  site.url + '/garant',
  'x'.repeat(4097),
])('refuse un lien ambigu ou externe', (valeur) => {
  expect(jetonDuLienSource(valeur)).toBeNull()
})
