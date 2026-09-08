import { afterAll, beforeAll, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, refus } from './base'
let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => db.close())
test('aucun role public ne confirme une maintenance a la place du serveur', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien'] as const) {
    await devenir(db, role)
    expect(await refus(db, 'select confirmer_maintenance()')).toContain('permission denied')
    expect(await refus(db, 'select * from maintenance_courante')).toContain('permission denied')
  }
})
test('la confirmation vient de la base et aucune date ne vient de l appelant', async () => {
  await devenir(db, 'serveur')
  expect(
    (await db.query<{ etat: { derniere_reussite: null } }>('select etat_maintenance() as etat'))
      .rows[0]!.etat.derniere_reussite,
  ).toBeNull()
  expect(
    (await db.query<{ ok: boolean }>('select confirmer_maintenance() as ok')).rows[0]!.ok,
  ).toBe(true)
  expect(
    (await db.query<{ etat: { derniere_reussite: string } }>('select etat_maintenance() as etat'))
      .rows[0]!.etat.derniere_reussite,
  ).toBeTruthy()
})
