import { expect, test } from 'vitest'
import { echeanceActe } from '@/lib/signature/echeance'
test.each(['2026-09-23T01:00:00Z', '2026-09-23T23:59:00Z'])(
  'aligne la borne locale et la date fournisseur a %s',
  (maintenant) => {
    const e = echeanceActe('2026-12-01T00:00:00Z', Date.parse(maintenant))
    expect(e.toISOString()).toBe('2026-09-26T00:00:00.000Z')
    expect(e.getTime()).toBe(Date.parse(e.toISOString().slice(0, 10) + 'T00:00:00Z'))
  },
)
test('garde une journee entre la limite fournisseur et celle du dossier', () => {
  expect(
    echeanceActe('2026-09-25T18:00:00Z', Date.parse('2026-09-23T00:00:00Z')).toISOString(),
  ).toBe('2026-09-24T00:00:00.000Z')
})
test.each(['invalide', '2026-09-24T23:00:00Z', '2026-09-22T00:00:00Z'])(
  'refuse un dossier trop court ou invalide %s',
  (fin) => {
    expect(() => echeanceActe(fin, Date.parse('2026-09-23T12:00:00Z'))).toThrow()
  },
)
