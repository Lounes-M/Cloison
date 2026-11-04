import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

import { journal } from '@/lib/content/journal'
import { actions } from '@/lib/content/espace'

/** Les actions admises par la derniere migration qui redefinit la contrainte du journal. */
function actionsDuJournal(): string[] {
  const dossier = 'supabase/migrations'
  const derniere = readdirSync(dossier)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(`${dossier}/${f}`, 'utf8'))
    .filter((sql) => sql.includes('add constraint journal_acces_action_check'))
    .at(-1)!
  const liste = /journal_acces_action_check check\s*\(\s*action in\s*\(([^)]*)\)/.exec(
    derniere,
  )![1]!
  return [...liste.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
}

test('chaque action du journal a un libelle pour l agence et pour le garant', () => {
  const admises = actionsDuJournal()
  expect(admises).toContain('relances_reprises')
  for (const action of admises) {
    expect(actions[action], action).toBeTruthy()
    expect(journal.actions[action], action).toBeTruthy()
  }
})

test('cote agence, chaque libelle suit le nom de son auteur', () => {
  for (const libelle of Object.values(actions)) expect(libelle).toMatch(/^a /)
})
