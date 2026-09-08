import { afterAll, beforeAll, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, refus } from './base'
let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
  await devenir(db, 'serveur')
})
afterAll(async () => {
  await db.close()
})
test.each([
  ['depot_dossier', 20],
  ['depot_ip', 60],
  ['depot_global', 300],
])('le plafond %s refuse les tentatives supplementaires', async (sujet, plafond) => {
  const empreinte = 'e'.repeat(64)
  for (let i = 0; i < Number(plafond); i++) {
    const { rows } = await db.query<{ ok: boolean }>('select consommer_debit($1,$2) as ok', [
      sujet,
      empreinte,
    ])
    expect(rows[0]!.ok).toBe(true)
  }
  const { rows } = await db.query<{ ok: boolean }>('select consommer_debit($1,$2) as ok', [
    sujet,
    empreinte,
  ])
  expect(rows[0]!.ok).toBe(false)
})
test('le porteur ne manipule pas les compteurs', async () => {
  await devenir(db, 'porteur_lien')
  expect(await refus(db, `select consommer_debit('depot_dossier', '${'e'.repeat(64)}')`)).toContain(
    'permission denied',
  )
})
