import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite, dossier: string, admin: string, agence: string, premier: string, second: string
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
    await db.query<{ d: string; u: string; a: string }>(
      "select current_setting('cloison.ocr_dossier') d,current_setting('cloison.ocr_membre') u,(select agence_id from dossiers where id=current_setting('cloison.ocr_dossier')::uuid) a",
    )
  ).rows[0]!
  dossier = r.d
  admin = r.u
  agence = r.a
  premier = randomUUID()
  second = randomUUID()
  for (const u of [premier, second]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) select $1::uuid,$1::uuid::text||'@'||domaine,now() from agences where id=$2",
      [u, agence],
    )
    await db.query(
      "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'membre')",
      [agence, u],
    )
  }
  await devenir(db, 'authenticated', admin)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function affecter(m: string | null = premier, r: string | null = null, d = dossier) {
  return (await db.query<{ r: string | null }>('select affecter_dossier($1,$2,$3) r', [d, m, r]))
    .rows[0]!.r
}
async function lire(ids = [dossier]) {
  return (
    await db.query<{ revision: string | null }>(
      'select * from responsables_des_dossiers($1::uuid[])',
      [ids],
    )
  ).rows
}
test('un administrateur attribue puis reattribue avec revision', async () => {
  const r = await affecter()
  expect(r).toBeTruthy()
  expect(await lire()).toEqual([
    expect.objectContaining({ dossier_id: dossier, responsable_id: premier, revision: r }),
  ])
  expect(await affecter(second)).toBeNull()
  const suivant = await affecter(second, r)
  expect(suivant).toBeTruthy()
  expect(suivant).not.toBe(r)
  expect(await affecter(premier, r)).toBeNull()
  expect(await affecter(second, suivant)).toBe(suivant)
})
test('un membre prend un dossier libre et libere uniquement le sien', async () => {
  await devenir(db, 'authenticated', premier)
  expect(await affecter(null)).toBeNull()
  const r = await affecter()
  expect(r).toBeTruthy()
  expect(await affecter(second, r)).toBeNull()
  const libere = await affecter(null, r)
  expect(libere).toBeTruthy()
  expect(await lire()).toEqual([
    expect.objectContaining({ responsable_id: null, revision: libere }),
  ])
})
test('un collegue ne vole pas et ne libere pas le dossier attribue', async () => {
  const r = await affecter()
  await devenir(db, 'authenticated', second)
  expect(await affecter(second, r)).toBeNull()
  expect(await affecter(null, r)).toBeNull()
  expect(await affecter(premier, r)).toBeNull()
})
test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne gere pas les responsables',
  async (role) => {
    await db.exec(`set local role ${role};savepoint droits`)
    await expect(affecter()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to droits')
    await expect(lire()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to droits')
    await expect(db.query('select * from affectations_dossiers')).rejects.toThrow(
      /permission denied/,
    )
  },
)
test.each(['insert', 'update', 'delete'])(
  'refuse %s direct meme a l administrateur',
  async (op) => {
    await affecter()
    const sql =
      op === 'insert'
        ? `insert into affectations_dossiers(dossier_id) values('${dossier}')`
        : op === 'update'
          ? 'update affectations_dossiers set membre_id=null'
          : 'delete from affectations_dossiers'
    await expect(db.query(sql)).rejects.toThrow(/permission denied/)
  },
)
test('la lecture et l ecriture exigent le MFA', async () => {
  const r = await affecter()
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ role: 'authenticated', sub: admin, aal: 'aal1' }),
  ])
  expect(await lire()).toEqual([])
  expect((await db.query('select * from affectations_dossiers')).rows).toEqual([])
  expect(await affecter(second, r)).toBeNull()
})
test('une autre agence ne lit ni ne modifie les responsables', async () => {
  const r = await affecter()
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
  await devenir(db, 'authenticated', admin)
  expect(await affecter(u, r)).toBeNull()
  await devenir(db, 'authenticated', u)
  expect(await lire()).toEqual([])
  expect((await db.query('select * from affectations_dossiers')).rows).toEqual([])
  expect(await affecter(u, r)).toBeNull()
})
test.each(['inconnu', 'non_confirme', 'domaine'])('refuse un destinataire %s', async (cas) => {
  await redevenirProprietaire(db)
  if (cas === 'non_confirme')
    await db.query('update auth.users set email_confirmed_at=null where id=$1', [premier])
  if (cas === 'domaine')
    await db.query("update auth.users set email='tiers@autre.invalid' where id=$1", [premier])
  await devenir(db, 'authenticated', admin)
  expect(await affecter(cas === 'inconnu' ? randomUUID() : premier)).toBeNull()
})
test('un dossier expire refuse aussi le rejeu sans modification', async () => {
  const r = await affecter()
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '100 days',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', admin)
  expect(await lire()).toEqual([])
  expect((await db.query('select * from affectations_dossiers')).rows).toEqual([])
  expect(await affecter(premier, r)).toBeNull()
  expect(await affecter(second, r)).toBeNull()
})
test('un dossier refuse ne peut plus etre attribue', async () => {
  await redevenirProprietaire(db)
  await db.query("update dossiers set statut='refuse' where id=$1", [dossier])
  await devenir(db, 'authenticated', admin)
  expect(await affecter()).toBeNull()
})
test('l exclusion libere le dossier et invalide sa revision meme apres readmission', async () => {
  const r = await affecter()
  await redevenirProprietaire(db)
  await db.query('delete from membres_agence where utilisateur_id=$1', [premier])
  await devenir(db, 'authenticated', admin)
  const apres = await lire()
  expect(apres).toEqual([expect.objectContaining({ responsable_id: null })])
  expect(apres[0]!.revision).not.toBe(r)
  expect(await affecter(second, r)).toBeNull()
  await db.query('select readmettre_collaborateur($1)', [premier])
  await redevenirProprietaire(db)
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'membre')",
    [agence, premier],
  )
  await devenir(db, 'authenticated', admin)
  expect(await lire()).toEqual([expect.objectContaining({ responsable_id: null })])
})
test('une remise a null directe renouvelle aussi la revision', async () => {
  const r = await affecter()
  await redevenirProprietaire(db)
  // Simuler le chemin FK direct, avant la cascade des appartenances.
  await db.query('update affectations_dossiers set membre_id=null where dossier_id=$1', [dossier])
  expect(
    (
      await db.query<{ revision: string }>(
        'select revision from affectations_dossiers where dossier_id=$1',
        [dossier],
      )
    ).rows[0]!.revision,
  ).not.toBe(r)
  await devenir(db, 'authenticated', admin)
  expect(await affecter(second, r)).toBeNull()
})

test.each(['administrateur', 'compte_supprime'])(
  'la suppression Auth par %s libere le dossier et invalide la revision',
  async (acteur) => {
    const r = await affecter()
    await redevenirProprietaire(db)
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: acteur === 'compte_supprime' ? premier : admin, aal: 'aal2' }),
    ])
    await db.query('delete from auth.users where id=$1', [premier])
    await devenir(db, 'authenticated', admin)
    const apres = await lire()
    expect(apres).toEqual([expect.objectContaining({ responsable_id: null })])
    expect(apres[0]!.revision).not.toBe(r)
    expect(await affecter(second, r)).toBeNull()
  },
)
test('ne divulgue pas une nouvelle adresse hors agence', async () => {
  await affecter()
  await redevenirProprietaire(db)
  await db.query("update auth.users set email='prive@autre.invalid' where id=$1", [premier])
  await devenir(db, 'authenticated', admin)
  expect(await lire()).toEqual([
    expect.objectContaining({ responsable_id: premier, responsable_email: null }),
  ])
})
test('borne la projection aux cinquante dossiers demandes', async () => {
  expect(await lire([])).toEqual([])
  expect(await lire(Array.from({ length: 51 }, () => dossier))).toEqual([])
  expect(await lire([randomUUID()])).toEqual([])
  expect(await lire()).toEqual([
    expect.objectContaining({ dossier_id: dossier, responsable_id: null }),
  ])
})
