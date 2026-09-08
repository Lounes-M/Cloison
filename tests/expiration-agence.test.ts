import { afterAll, beforeAll, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire, refus, compter } from './base'
let db: PGlite
const utilisateur = '11111111-1111-4111-8111-111111111111'
const dossier = '22222222-2222-4222-8222-222222222222'
beforeAll(async () => {
  db = await baseDEssai()
  await db.query(
    `insert into auth.users(id,email,email_confirmed_at) values ($1,'fixture@agence-expiration.fr',now())`,
    [utilisateur],
  )
  await devenir(db, 'authenticated', utilisateur)
  const { rows } = await db.query<{ id: string }>(
    "select public.rejoindre_ou_creer_agence('Fixture') as id",
  )
  await redevenirProprietaire(db)
  await db.query(
    `insert into public.dossiers(id,agence_id,email_locataire) values ($1,$2,'fixture@example.invalid')`,
    [dossier, rows[0]!.id],
  )
  await db.query(`insert into public.engagements(dossier_id) values ($1)`, [dossier])
  await db.query(
    `insert into public.pieces(dossier_id,type,chemin,taille_octets,type_reel) values ($1,'bulletin_paie',$2,100,'application/pdf')`,
    [dossier, `${dossier}/fixture`],
  )
  await db.query(
    `insert into public.cles_dossier(dossier_id,cle_scellee) values ($1,decode(repeat('ab',60),'hex'))`,
    [dossier],
  )
  await db.query(`insert into storage.objects(bucket_id,name) values ('pieces',$1)`, [
    `${dossier}/fixture`,
  ])
  await devenir(db, 'authenticated', utilisateur)
  expect(await compter(db, 'public.dossiers')).toBe(1)
  await db.query(`select public.journaliser($1,'dossier_consulte')`, [dossier])
  await redevenirProprietaire(db)
  await db.query(
    `update public.dossiers set cree_le=now()-interval '4 months', expire_le=now()-interval '1 second' where id=$1`,
    [dossier],
  )
  await devenir(db, 'authenticated', utilisateur)
})
afterAll(async () => {
  if (db) await db.close()
})
test.each([
  'public.dossiers',
  'public.engagements',
  'public.pieces',
  'public.cles_dossier',
  'public.journal_acces',
  'storage.objects',
])("l'agence ne lit plus %s a echeance, meme avant la purge", async (table) => {
  expect(await compter(db, table)).toBe(0)
})
test("l'agence ne journalise plus un dossier expire", async () => {
  expect(await refus(db, `select public.journaliser('${dossier}','dossier_consulte')`)).toContain(
    'Aucun acces',
  )
})
test('la disparition des donnees ne simule pas le refus', async () => {
  await redevenirProprietaire(db)
  expect(await compter(db, 'public.pieces')).toBe(1)
  expect(await compter(db, 'storage.objects')).toBe(1)
  await devenir(db, 'authenticated', utilisateur)
})
