import { expect, test } from 'vitest'
import { calendrierEcheance } from '@/lib/agences/calendrier'
const id = '11111111-1111-4111-8111-111111111111'
const maintenant = new Date('2026-09-15T08:00:00Z')
const dossier = { id, reference: 'DOSSIER123', expire_le: '2026-10-25T02:30:00+01:00' }

test('un evenement UTC ponctuel sans invitation, coordonnees ni piece', () => {
  const resultat = calendrierEcheance(
    { ...dossier, email_locataire: 'secret@example.invalid' } as typeof dossier,
    maintenant,
  )
  expect(resultat).toContain('DTSTART:20261025T013000Z\r\n')
  expect(resultat).toContain('DTSTAMP:20260915T080000Z\r\n')
  expect(resultat).toContain(`UID:coffre-${id}@cloison.immo\r\n`)
  expect(resultat).toContain('TRANSP:TRANSPARENT\r\n')
  expect(resultat).toMatch(/^BEGIN:VCALENDAR\r\n/)
  expect(resultat).toMatch(/END:VCALENDAR\r\n$/)
  expect(resultat).not.toMatch(/secret|ATTENDEE|ORGANIZER|METHOD|VALARM|ATTACH|URL:/)
})

test('les retours et separateurs de reference restent du texte', () => {
  const resultat = calendrierEcheance(
    { ...dossier, reference: 'ABC\r\nATTENDEE:x;z,\\' },
    maintenant,
  )
  expect(resultat).not.toContain('\r\nATTENDEE:')
  expect(resultat.replace(/\r\n /g, '')).toContain('ABC\\nATTENDEE:x\\;z\\,\\\\')
  expect(resultat.match(/BEGIN:VEVENT/g)).toHaveLength(1)
})

test('les lignes respectent 75 octets et les caracteres UTF-8 restent intacts', () => {
  const reference = 'é'.repeat(32)
  const resultat = calendrierEcheance({ ...dossier, reference }, maintenant)
  for (const ligne of resultat.split('\r\n'))
    expect(Buffer.byteLength(ligne)).toBeLessThanOrEqual(75)
  expect(resultat.replace(/\r\n /g, '')).toContain(reference)
  expect(Buffer.from(resultat).toString('utf8')).toBe(resultat)
})

test.each([
  'invalide',
  '2026-02-30T12:00:00Z',
  '2026-09-15T08:00:00Z',
  '2026-09-14T08:00:00Z',
  '2026-10-25',
])('refuse une echeance invalide ou echue : %s', (expire_le) => {
  expect(() => calendrierEcheance({ ...dossier, expire_le }, maintenant)).toThrow(
    'Echeance indisponible.',
  )
})

test.each(['', 'x'.repeat(33), '\u0000', '\u0007'])(
  'refuse une reference hors contrat',
  (reference) => {
    expect(() => calendrierEcheance({ ...dossier, reference }, maintenant)).toThrow()
  },
)

test('refuse un identifiant non canonique et une horloge invalide', () => {
  expect(() => calendrierEcheance({ ...dossier, id: '../autre' }, maintenant)).toThrow()
  expect(() => calendrierEcheance(dossier, new Date(NaN))).toThrow()
})
