import { afterEach, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenirPorteur } from './base'
let db: PGlite
beforeEach(async () => {
  db = await baseDEssai()
})
afterEach(async () => {
  await db.close()
})
test('le journal du garant isole le dossier et reste invisible au locataire', async () => {
  const { rows } = await db.query<{ id: string }>(
    "insert into dossiers(email_locataire,reference) values ('a@audit.invalid','JOURNAL12345'),('b@audit.invalid','JOURNAL67890') returning id",
  )
  for (const d of rows)
    await db.query(
      "insert into journal_acces(dossier_id,action,acteur) values ($1,'dossier_consulte','garant')",
      [d.id],
    )
  await devenirPorteur(db, rows[0]!.id, 'garant')
  expect((await db.query('select * from mon_journal_acces()')).rows).toHaveLength(1)
  await devenirPorteur(db, rows[0]!.id, 'locataire')
  expect((await db.query('select * from mon_journal_acces()')).rows).toEqual([])
})
