import { beforeAll, beforeEach, afterEach, afterAll, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite, dossier: string, piece: string, membre: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  await db.exec(
    readFileSync('supabase/essais/lecture-ocr.sql', 'utf8').split(
      'set local role authenticated;',
    )[0]!,
  )
  const r = (
    await db.query<{ d: string; p: string; u: string }>(
      "select current_setting('cloison.ocr_dossier') d,current_setting('cloison.ocr_piece') p,current_setting('cloison.ocr_membre') u",
    )
  ).rows[0]!
  dossier = r.d
  piece = r.p
  membre = r.u
  await devenir(db, 'authenticated', membre)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function examiner(etat = 'examine', revision: string | null = null, p = piece, d = dossier) {
  return (
    await db.query<{ r: string | null }>('select enregistrer_examen_documentaire($1,$2,$3,$4) r', [
      d,
      p,
      etat,
      revision,
    ])
  ).rows[0]!.r
}
async function lire(d = dossier) {
  return (await db.query('select * from examens_du_dossier($1)', [d])).rows
}
test('une appreciation exige une revision courante et ne modifie pas le dossier', async () => {
  const avant = (await db.query('select statut from dossiers where id=$1', [dossier])).rows
  const revision = await examiner()
  expect(revision).toMatch(/^[a-f0-9-]{36}$/)
  expect(await lire()).toEqual([
    expect.objectContaining({ piece_id: piece, revision, etat: 'examine' }),
  ])
  expect(await examiner('a_revoir')).toBeNull()
  const suivante = await examiner('a_revoir', revision)
  expect(suivante).not.toBe(revision)
  expect(await examiner('examine', revision)).toBeNull()
  expect(await lire()).toEqual([expect.objectContaining({ revision: suivante, etat: 'a_revoir' })])
  expect((await db.query('select statut from dossiers where id=$1', [dossier])).rows).toEqual(avant)
  expect((await db.query('select etat from examens_documentaires order by id')).rows).toEqual([
    { etat: 'examine' },
    { etat: 'a_revoir' },
  ])
})
test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne peut pas ecrire ou lire les examens',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await db.exec('savepoint droits')
    await expect(examiner()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to droits')
    await expect(lire()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to droits')
    await expect(db.query('select * from examens_documentaires')).rejects.toThrow(
      /permission denied/,
    )
  },
)
test.each(['update', 'delete', 'insert'])(
  'un membre ne peut pas effectuer %s directement',
  async (op) => {
    await examiner()
    const sql =
      op === 'update'
        ? "update examens_documentaires set etat='a_revoir'"
        : op === 'delete'
          ? 'delete from examens_documentaires'
          : `insert into examens_documentaires(dossier_id,piece_id,etat) values('${dossier}','${piece}','examine')`
    await expect(db.query(sql)).rejects.toThrow(/permission denied/)
  },
)
test('un autre membre sans agence ne peut pas lire ou ecrire', async () => {
  await examiner()
  await devenir(db, 'authenticated', randomUUID())
  expect(await lire()).toEqual([])
  expect((await db.query('select * from examens_documentaires')).rows).toEqual([])
  expect(await examiner()).toBeNull()
})
test('une autre agence ne lit pas les appreciations et ne les ecrase pas', async () => {
  const revision = await examiner()
  await redevenirProprietaire(db)
  const a = randomUUID(),
    u = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Autre','autre.invalid')", [a])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@autre.invalid',now())",
    [u],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [a, u],
  )
  await devenir(db, 'authenticated', u)
  expect(await lire()).toEqual([])
  expect((await db.query('select * from examens_documentaires')).rows).toEqual([])
  expect(await examiner('a_revoir', revision)).toBeNull()
})
test('une session sans MFA ne peut ni lire ni enregistrer', async () => {
  const revision = await examiner()
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal1' }),
  ])
  expect(await lire()).toEqual([])
  expect((await db.query('select * from examens_documentaires')).rows).toEqual([])
  expect(await examiner('a_revoir', revision)).toBeNull()
})
test('une expiration retire la lecture et refuse toute nouvelle appreciation', async () => {
  const revision = await examiner()
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '100 days',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await lire()).toEqual([])
  expect((await db.query('select * from examens_documentaires')).rows).toEqual([])
  expect(await examiner('a_revoir', revision)).toBeNull()
})
test('refuse un autre dossier, une piece absente et un etat invalide', async () => {
  expect(await examiner('examine', null, randomUUID())).toBeNull()
  expect(await examiner('examine', null, piece, randomUUID())).toBeNull()
  expect(await examiner('certifie')).toBeNull()
})
test('une piece ne peut pas etre rattachee a un autre dossier de la meme agence', async () => {
  await redevenirProprietaire(db)
  const autre = randomUUID()
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire) select $1,agence_id,'autre@example.invalid' from dossiers where id=$2",
    [autre, dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await examiner('examine', null, piece, autre)).toBeNull()
})
test('un nouveau fichier ne reprend jamais la revision du precedent', async () => {
  const ancienne = await examiner()
  await db.query("select demander_complement($1,'illisible')", [piece])
  await redevenirProprietaire(db)
  const nouvelle = randomUUID(),
    chemin = `${dossier}/${nouvelle}`
  await db.query('insert into reservations_depot(chemin,dossier_id) values($1,$2)', [
    chemin,
    dossier,
  ])
  await db.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [chemin])
  await db.query(
    "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values($1,$2,'piece_identite',$3,100,'application/pdf')",
    [nouvelle, dossier, chemin],
  )
  await devenir(db, 'authenticated', membre)
  expect(await examiner('examine', ancienne, nouvelle)).toBeNull()
  expect(await examiner('examine', null, nouvelle)).toBeTruthy()
  expect(await lire()).toEqual([expect.objectContaining({ piece_id: nouvelle })])
})
test('ne divulgue pas la nouvelle adresse d un ancien collaborateur', async () => {
  await examiner()
  await redevenirProprietaire(db)
  const second = randomUUID()
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) select $1,'second@'||a.domaine,now() from agences a join dossiers d on d.agence_id=a.id where d.id=$2",
    [second, dossier],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) select agence_id,$1,'admin' from dossiers where id=$2",
    [second, dossier],
  )
  await db.query('delete from membres_agence where utilisateur_id=$1', [membre])
  await db.query("update auth.users set email='nouveau@confidentiel.invalid' where id=$1", [membre])
  await devenir(db, 'authenticated', second)
  expect(await lire()).toEqual([expect.objectContaining({ acteur: null })])
})
test('la piece ecartee ne peut pas garder une appreciation courante', async () => {
  const revision = await examiner()
  expect(
    (await db.query("select demander_complement($1,'illisible') ok", [piece])).rows[0],
  ).toEqual({ ok: true })
  expect(await lire()).toEqual([])
  expect(await examiner('examine', revision)).toBeNull()
})
test('borne les changements a vingt par piece et par jour', async () => {
  let r: string | null = null
  for (let i = 0; i < 20; i++) {
    r = await examiner(i % 2 ? 'a_revoir' : 'examine', r)
    expect(r).toBeTruthy()
  }
  expect(await examiner('a_examiner', r)).toBeNull()
})
test('un dossier refuse ne peut plus etre examine', async () => {
  const r = await examiner()
  await redevenirProprietaire(db)
  await db.query("update dossiers set statut='refuse' where id=$1", [dossier])
  await devenir(db, 'authenticated', membre)
  expect(await examiner('a_revoir', r)).toBeNull()
})
test('la suppression de la piece retire ses appreciations', async () => {
  await examiner()
  await redevenirProprietaire(db)
  await db.query('delete from pieces where id=$1', [piece])
  expect(
    (await db.query('select * from examens_documentaires where piece_id=$1', [piece])).rows,
  ).toEqual([])
})
