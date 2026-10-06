import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
import { lireCadenceActes } from '@/lib/exploitation/cadence-actes.mjs'
let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function etat() {
  return (await db.query<{ r: unknown }>('select public.etat_traitements_actes() r')).rows[0]!.r
}
test('la cadence initiale ne passe pas au vert sans trois confirmations', async () => {
  await devenir(db, 'serveur')
  expect(lireCadenceActes(await etat())).toEqual({ conforme: false })
  for (const nom of ['signature', 'archives', 'reglements'])
    expect(
      (await db.query<{ ok: boolean }>('select confirmer_traitement_actes($1,true) ok', [nom]))
        .rows[0]!.ok,
    ).toBe(true)
  expect(lireCadenceActes(await etat())).toEqual({ conforme: true })
  await db.query("select confirmer_traitement_actes('archives',false)")
  expect(lireCadenceActes(await etat())).toEqual({ conforme: false })
})
test('un nom inconnu ou un resultat absent ne confirme rien', async () => {
  await devenir(db, 'serveur')
  expect(
    (await db.query<{ ok: boolean }>('select confirmer_traitement_actes($1,true) ok', ['inconnu']))
      .rows[0]!.ok,
  ).toBe(false)
  expect(
    (await db.query<{ ok: boolean }>("select confirmer_traitement_actes('archives',null) ok"))
      .rows[0]!.ok,
  ).toBe(false)
})
test('une confirmation ancienne reste refusee', async () => {
  await db.exec(
    "update traitements_actes set reussi=true,confirme_le=clock_timestamp()-interval '16 minutes'",
  )
  await devenir(db, 'serveur')
  expect(lireCadenceActes(await etat())).toEqual({ conforme: false })
})
test.each(['anon', 'authenticated', 'porteur_lien', 'depot_piece', 'archive_signature'])(
  'le role %s ne peut confirmer un traitement',
  async (role) => {
    await db.exec(`set role ${role}`)
    await expect(db.query("select confirmer_traitement_actes('archives',true)")).rejects.toThrow(
      /permission denied/,
    )
  },
)
test.each(['anon', 'authenticated', 'porteur_lien', 'depot_piece', 'archive_signature'])(
  'le role %s ne lit pas les compteurs',
  async (role) => {
    await db.exec(`set role ${role}`)
    await expect(db.query('select public.etat_traitements_actes()')).rejects.toThrow(
      /permission denied/,
    )
  },
)
test('le role serveur ne modifie pas directement la table', async () => {
  await devenir(db, 'serveur')
  await expect(db.query('update traitements_actes set reussi=true')).rejects.toThrow(
    /permission denied/,
  )
})
