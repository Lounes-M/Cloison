import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { baseDEssai, devenirPorteur, redevenirProprietaire, refus } from './base'

let db: PGlite
const DOSSIER = '44444444-4444-4444-4444-444444444444'
const CHEMIN = `${DOSSIER}/55555555-5555-4555-8555-555555555555`
const OBJET = `insert into storage.objects(bucket_id,name) values ('pieces','${CHEMIN}')`
const PIECE = `insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values ('${DOSSIER}','bulletin_paie','${CHEMIN}',100,'application/pdf')`
beforeEach(async () => {
  db = await baseDEssai()
  await db.query(
    "insert into dossiers(id,reference,email_locataire) values ($1,'CL-RESERVE','essai@example.test')",
    [DOSSIER],
  )
  await devenirPorteur(db, DOSSIER, 'garant')
  await db.exec('set role depot_piece')
})
afterEach(async () => db?.close())
async function reserver() {
  await db.query('select reserver_depot($1)', [CHEMIN])
}
async function expirer() {
  await redevenirProprietaire(db)
  await db.exec("update reservations_depot set expire_le=clock_timestamp()-interval '1 second'")
}
async function reprendre() {
  await redevenirProprietaire(db)
  await db.exec('set role serveur')
  await db.query('select reprendre_depots_inacheves()')
  await redevenirProprietaire(db)
}

test('un upload sans reservation est refuse', async () => {
  expect(await refus(db, OBJET)).toContain('row-level security')
})
test('un crash apres upload est repris et ne peut plus inscrire sa piece', async () => {
  await reserver()
  await db.exec(OBJET)
  await expirer()
  await reprendre()
  expect((await db.query('select chemin from objets_a_supprimer')).rows).toEqual([
    { chemin: CHEMIN },
  ])
  await db.exec('delete from objets_a_supprimer')
  await devenirPorteur(db, DOSSIER, 'garant')
  await db.exec('set role depot_piece')
  expect(await refus(db, PIECE)).toContain('abandonne')
})
test('un crash avant upload interdit aussi un upload tardif apres acquittement', async () => {
  await reserver()
  await expirer()
  await reprendre()
  await db.exec('delete from objets_a_supprimer')
  await devenirPorteur(db, DOSSIER, 'garant')
  await db.exec('set role depot_piece')
  expect(await refus(db, OBJET)).toContain('row-level security')
})
test('une inscription reussie consomme sa reservation et ne sera pas nettoyee', async () => {
  await reserver()
  await db.exec(OBJET)
  await db.exec(PIECE)
  await reprendre()
  expect((await db.query('select * from reservations_depot')).rows).toEqual([])
  expect((await db.query('select * from objets_a_supprimer')).rows).toEqual([])
})
test('une inscription sans octets ne consomme pas sa reservation', async () => {
  await reserver()
  expect(await refus(db, PIECE)).toContain('Reservation indisponible')
  await redevenirProprietaire(db)
  expect((await db.query('select * from reservations_depot')).rows).toHaveLength(1)
})
test('un dossier expire refuse upload meme si la reservation reste fraiche', async () => {
  await reserver()
  await redevenirProprietaire(db)
  await db.exec(
    "update dossiers set cree_le=clock_timestamp()-interval '2 days', expire_le=clock_timestamp()-interval '1 second'",
  )
  await devenirPorteur(db, DOSSIER, 'garant')
  await db.exec('set role depot_piece')
  expect(await refus(db, OBJET)).toContain('row-level security')
})
test('le navigateur garant ne peut pas creer de reservations', async () => {
  await db.exec('set role porteur_lien')
  await expect(reserver()).rejects.toThrow('permission denied')
})

test('une reservation expiree refuse inscription et upload avant meme la maintenance', async () => {
  await reserver()
  await expirer()
  await devenirPorteur(db, DOSSIER, 'garant')
  await db.exec('set role depot_piece')
  expect(await refus(db, OBJET)).toContain('row-level security')
  expect(await refus(db, PIECE)).toContain('Reservation indisponible')
})

test('le meme appel ne prolonge pas une reservation et vingt reservations bornent les depots', async () => {
  await reserver()
  await redevenirProprietaire(db)
  const avant = (await db.query('select expire_le from reservations_depot')).rows
  await devenirPorteur(db, DOSSIER, 'garant')
  await db.exec('set role depot_piece')
  await reserver()
  for (let i = 1; i < 20; i++) {
    const chemin = `${DOSSIER}/55555555-5555-4555-8555-${String(i).padStart(12, '0')}`
    await db.query('select reserver_depot($1)', [chemin])
  }
  await expect(
    db.query('select reserver_depot($1)', [`${DOSSIER}/66666666-6666-4666-8666-666666666666`]),
  ).rejects.toThrow('Trop de depots')
  await redevenirProprietaire(db)
  expect(
    (await db.query('select expire_le from reservations_depot where chemin=$1', [CHEMIN])).rows,
  ).toEqual(avant)
})

test('le navigateur garant ne peut pas fabriquer des metadonnees de piece', async () => {
  await db.exec('set role porteur_lien')
  expect(await refus(db, PIECE)).toContain('permission denied')
})
test('le role depot ne peut pas fabriquer une piece sans reservation', async () => {
  expect(await refus(db, PIECE)).toContain('Reservation indisponible')
})
