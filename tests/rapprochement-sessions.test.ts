import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'
let db: PGlite
const dossier = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const autre = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec('begin')
  await db.query(
    "insert into dossiers(id,email_locataire) values ($1,'fictif@example.invalid'),($2,'autre@example.invalid')",
    [dossier, autre],
  )
})
afterEach(async () => {
  await db.exec('rollback')
})
async function reserver(id = dossier, reference = 'cs_fictif', age = '1 hour') {
  await db.query(
    'insert into sessions_paiement(dossier_id,session_ref,cree_le) values ($1,$2,now()-$3::interval)',
    [id, reference, age],
  )
}
async function candidats() {
  await devenir(db, 'serveur')
  return (await db.query('select * from paiements_a_rapprocher()')).rows
}
async function rapprocher(reference = 'cs_fictif', id = dossier, version = 'locataire-2026-09-04') {
  await devenir(db, 'serveur')
  await db.query("select rapprocher_paiement($1,'pi_fictif',$2,900,'eur',$3,true)", [
    reference,
    id,
    version,
  ])
  await redevenirProprietaire(db)
  return (
    await db.query<{ marque: boolean; anomalie: boolean }>(
      'select marque,anomalie from registre_paiements where reference_session=$1',
      [reference],
    )
  ).rows[0]
}
test('une session reservee sans aucun webhook rejoint la file', async () => {
  await reserver()
  expect(await candidats()).toEqual([{ reference_session: 'cs_fictif' }])
  expect(await rapprocher()).toEqual({ marque: true, anomalie: false })
  expect(await candidats()).toEqual([])
  await redevenirProprietaire(db)
  expect((await db.query('select * from evenements_paiements')).rows).toEqual([])
})
test('une session recente laisse le temps au webhook', async () => {
  await reserver(dossier, 'cs_recent', '1 minute')
  expect(await candidats()).toEqual([])
})
test('une reservation sans reference fournisseur ne rejoint pas la file', async () => {
  await db.query(
    "insert into sessions_paiement(dossier_id,cree_le) values ($1,now()-interval '1 hour')",
    [dossier],
  )
  expect(await candidats()).toEqual([])
})
test('un dossier expire sans webhook ne relance pas sa reservation', async () => {
  await reserver()
  await db.query(
    "update dossiers set cree_le=now()-interval '4 months',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  expect(await candidats()).toEqual([])
})
test('une reservation deja prise ne repasse pas avant quinze minutes', async () => {
  await reserver()
  await devenir(db, 'serveur')
  await db.query("select reserver_rapprochement('cs_fictif')")
  expect(await candidats()).toEqual([])
})
test('le lot est borne et les references jamais tentees passent avant les echecs anciens', async () => {
  await reserver()
  await reserver(autre, 'cs_autre', '30 minutes')
  const troisieme = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  await db.query("insert into dossiers(id,email_locataire) values ($1,'trois@example.invalid')", [
    troisieme,
  ])
  await reserver(troisieme, 'cs_trois', '20 minutes')
  await db.query(
    "insert into tentatives_rapprochement(reference_session,essaye_le) values ('cs_fictif',now()-interval '20 minutes')",
  )
  expect(await candidats()).toEqual([
    { reference_session: 'cs_autre' },
    { reference_session: 'cs_trois' },
  ])
})
test('une autre session que celle reservee ne credite pas le dossier', async () => {
  await reserver()
  expect(await rapprocher('cs_autre')).toEqual({ marque: false, anomalie: true })
})
test('une reference reservee par un autre dossier ne credite pas celui des metadonnees', async () => {
  await reserver()
  expect(await rapprocher('cs_fictif', autre)).toEqual({ marque: false, anomalie: true })
})
test('un tarif fournisseur valide mais different du tarif reserve reste une anomalie', async () => {
  await reserver()
  await db.exec(
    "insert into tarifs_paiement(version,montant_cents,devise) values ('tarif-fictif',900,'eur')",
  )
  expect(await rapprocher('cs_fictif', dossier, 'tarif-fictif')).toEqual({
    marque: false,
    anomalie: true,
  })
})
test('les roles utilisateurs ne peuvent lancer la lecture financiere', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien', 'depot_piece'] as const) {
    await db.exec(`set role ${role}`)
    await db.exec('savepoint interdit')
    expect(await refus(db, 'select * from paiements_a_rapprocher()')).toContain('permission denied')
    await db.exec('rollback to savepoint interdit')
  }
})
