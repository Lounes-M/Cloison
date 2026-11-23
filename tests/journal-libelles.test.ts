import { expect, test } from 'vitest'

import { journal } from '@/lib/content/journal'
import { actions } from '@/lib/content/espace'
import { baseDEssai } from './base'

/**
 * Les actions admises par la contrainte du journal, lues dans la base une fois
 * toutes les migrations appliquees. Lire le texte de la derniere migration ne
 * suffit plus : plusieurs ajoutent leur action a la liste en place (0091).
 */
async function actionsDuJournal(): Promise<string[]> {
  const db = await baseDEssai()
  try {
    const { rows } = await db.query<{ definition: string }>(
      "select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.journal_acces'::regclass and conname='journal_acces_action_check'",
    )
    return [...rows[0]!.definition.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]!)
  } finally {
    await db.close()
  }
}

test('chaque action du journal a un libelle pour l agence et pour le garant', async () => {
  const admises = await actionsDuJournal()
  expect(admises).toContain('relances_reprises')
  expect(admises).toContain('code_2ddoc_verifie')
  for (const action of admises) {
    expect(actions[action], action).toBeTruthy()
    expect(journal.actions[action], action).toBeTruthy()
  }
})

test('cote agence, chaque libelle suit le nom de son auteur', () => {
  for (const libelle of Object.values(actions)) expect(libelle).toMatch(/^a /)
})
