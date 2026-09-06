import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { baseDEssai, devenirPorteur, redevenirProprietaire, refus } from './base'

let db: PGlite
const DOSSIER = '44444444-4444-4444-4444-444444444444'
const CHEMIN = `${DOSSIER}/55555555-5555-4555-8555-555555555555`
const INSERER = `insert into public.pieces(dossier_id,type,chemin,taille_octets,type_reel) values ('${DOSSIER}','bulletin_paie','${CHEMIN}',100,'application/pdf')`
beforeEach(async () => {
  db = await baseDEssai()
  await db.query(
    "insert into dossiers(id,reference,email_locataire) values ($1,'CL-ABCD12','essai@example.test')",
    [DOSSIER],
  )
  await db.query("insert into storage.objects(bucket_id,name) values ('pieces',$1)", [CHEMIN])
  await devenirPorteur(db, DOSSIER, 'garant')
})
afterEach(async () => db?.close())

async function programmer() {
  return db.query('select public.programmer_suppression_objet($1)', [CHEMIN])
}
async function compte() {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ n: number }>(
    'select count(*)::int as n from objets_a_supprimer',
  )
  return rows[0]!.n
}

test('une inscription commise dont la reponse est perdue ne programme pas ses octets', async () => {
  await db.exec(INSERER)
  await programmer()
  expect(await compte()).toBe(0)
})

test('un abandon programme reste irreinscriptible apres acquittement Storage', async () => {
  await programmer()
  expect(await compte()).toBe(1)
  await db.exec('delete from objets_a_supprimer')
  await devenirPorteur(db, DOSSIER, 'garant')
  expect(await refus(db, INSERER)).toContain('abandonne')
})

test('le retrait programme atomiquement ses octets et interdit la reutilisation', async () => {
  await db.exec(INSERER)
  await db.exec(`delete from pieces where chemin='${CHEMIN}'`)
  expect(await compte()).toBe(1)
  await db.exec('delete from objets_a_supprimer')
  await devenirPorteur(db, DOSSIER, 'garant')
  expect(await refus(db, INSERER)).toContain('abandonne')
})

test('la cascade dossier laisse la file de nettoyage', async () => {
  await db.exec(INSERER)
  await redevenirProprietaire(db)
  await db.exec(`delete from dossiers where id='${DOSSIER}'`)
  expect(await compte()).toBe(1)
})

test('un locataire ne peut pas programmer une suppression', async () => {
  await devenirPorteur(db, DOSSIER, 'locataire')
  await expect(programmer()).rejects.toThrow('Suppression refusee')
  expect(await compte()).toBe(0)
})

test('un garant ne peut pas programmer un chemin hors de son dossier', async () => {
  await expect(
    db.query('select public.programmer_suppression_objet($1)', [
      '66666666-6666-4666-8666-666666666666/fichier',
    ]),
  ).rejects.toThrow('Suppression refusee')
  expect(await compte()).toBe(0)
})

for (const role of ['porteur_lien', 'depot_piece']) {
  test(`${role} ne peut pas supprimer directement les octets`, async () => {
    await redevenirProprietaire(db)
    await devenirPorteur(db, DOSSIER, 'garant')
    if (role === 'depot_piece') await db.exec('set role depot_piece')
    expect(await refus(db, `delete from storage.objects where name='${CHEMIN}'`)).toContain(
      'permission denied',
    )
  })
}

test('un chemin invente ne remplit ni la file ni les marqueurs', async () => {
  await db.query('select public.programmer_suppression_objet($1)', [`${DOSSIER}/inexistant`])
  expect(await compte()).toBe(0)
  expect((await db.query('select * from chemins_abandonnes')).rows).toEqual([])
})
