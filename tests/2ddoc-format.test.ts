import { expect, test } from 'vitest'

import { analyserCode, decoderBase32, lireValeursAvis } from '@/lib/2ddoc/format'
import fixture from './fixtures/2ddoc.json'

const avis = Buffer.from(fixture.codes.avis, 'base64')

test('un code bien forme est decoupe sans toucher aux octets signes', () => {
  const code = analyserCode(avis)!
  expect(code).toMatchObject({ version: '04', autorite: 'ZZ01', certificat: 'AV01', type: '28' })
  expect(code.date?.toISOString()).toBe('2025-07-31T00:00:00.000Z')
  expect(code.signature).toHaveLength(64)
  // Ce qui est signe : tout ce qui precede le separateur, a l'octet pres.
  expect(code.signe.equals(avis.subarray(0, avis.indexOf(0x1f)))).toBe(true)
  expect(code.message.equals(code.signe.subarray(26))).toBe(true)
})

test.each([
  ['vide', Buffer.alloc(0)],
  ['un autre DataMatrix', Buffer.from('0101234567890128'.repeat(4))],
  ['version inconnue', Buffer.from(avis.toString('latin1').replace('DC04', 'DC09'), 'latin1')],
  ['sans signature', avis.subarray(0, avis.indexOf(0x1f) + 1)],
  ['sans separateur', avis.subarray(0, avis.indexOf(0x1f))],
  ['deux separateurs', Buffer.concat([avis, Buffer.from('\x1fAAAA')])],
  ['signature hors Base32', Buffer.concat([avis, Buffer.from('1')])],
  ['octet de controle', Buffer.concat([avis.subarray(0, 30), Buffer.from([0]), avis.subarray(30)])],
  ['trop long', Buffer.concat([avis, Buffer.alloc(2100, 0x41)])],
])('refuse %s', (_nom, octets) => {
  expect(analyserCode(octets)).toBeNull()
})

test("une annexe apres la signature n'entre ni dans la signature ni dans ce qui est signe", () => {
  const code = analyserCode(Buffer.concat([avis, Buffer.from('\x1dANNEXE')]))!
  expect(code.signature.equals(analyserCode(avis)!.signature)).toBe(true)
  expect(code.signe.equals(analyserCode(avis)!.signe)).toBe(true)
})

test('le Base32 est decode a la lettre, sans ecriture alternative', () => {
  expect(decoderBase32('MZXW6YTBOI')?.toString()).toBe('foobar')
  expect(decoderBase32('MZXW6YTBOI======')?.toString()).toBe('foobar')
  // Bits de bourrage non nuls : la meme signature aurait deux ecritures.
  expect(decoderBase32('MZXW6YTBOJ')).toBeNull()
  expect(decoderBase32('mzxw6ytboi')).toBeNull()
  expect(decoderBase32('')).toBeNull()
})

test('les valeurs utiles sont lues, les numeros fiscaux jamais rendus', () => {
  const valeurs = lireValeursAvis(analyserCode(avis)!.message)
  expect(valeurs).toEqual({
    annee: '2024',
    declarants: ['MME DUPONT MARIE', 'M DUPONT JEAN'],
    revenuFiscalDeReference: '31250',
    parts: '2.5',
    reference: '25B1234567890',
  })
  expect(JSON.stringify(valeurs)).not.toMatch(/1234567890123|1234567890124/)
})

test('la lecture des valeurs s arrete au premier champ inconnu', () => {
  const message = analyserCode(Buffer.from(fixture.codes.avisChampInconnu, 'base64'))!.message
  expect(lireValeursAvis(message)).toEqual({ annee: '2024' })
})

test.each([
  ['45ABCD', {}],
  ['41douze\x1d', {}],
  ['43\x1d452024', { annee: '2024' }],
  ['452024452025', { annee: '2024' }],
  ['44COURT', {}],
])('une valeur de forme inattendue est ecartee : %j', (message, attendu) => {
  expect(lireValeursAvis(Buffer.from(message, 'latin1'))).toEqual(attendu)
})
