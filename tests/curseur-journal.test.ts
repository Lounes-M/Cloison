import { expect, test } from 'vitest'
import { lireCurseurJournal, pageJournal } from '@/lib/journal/pagination'
const dossier = '00000000-0000-4000-8000-000000000091',
  id = '00000000-0000-4000-8000-000000000092',
  quand = '2026-09-08T12:00:00.123456+00:00'
const encoder = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
test('le curseur preserve les microsecondes et n affiche pas la ligne sentinelle', () => {
  const entree = { id, quand, acteur: 'agence', action: 'dossier_consulte', identite: null }
  const page = pageJournal(
    Array.from({ length: 51 }, () => entree),
    dossier,
  )
  expect(page.lignes).toHaveLength(50)
  expect(lireCurseurJournal(page.suivant, dossier)).toEqual({ id, quand })
  expect(pageJournal([entree], dossier).suivant).toBeNull()
})
test('un curseur invalide ou un ancien dossier revient au debut sans clause SQL', () => {
  for (const valeur of [
    undefined,
    [],
    {},
    'x'.repeat(513),
    '../',
    encoder([id, quand, id]),
    encoder([dossier, '2026-02-30T12:00:00Z', id]),
    encoder([dossier, quand, 'id);select']),
    encoder([dossier, quand, id, 'intrus']),
  ])
    expect(lireCurseurJournal(valeur, dossier)).toBeNull()
})
