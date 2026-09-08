import { afterAll, beforeAll, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'
let db: PGlite
const a = '10000000-0000-4000-8000-000000000001',
  b = '10000000-0000-4000-8000-000000000002'
const u = '20000000-0000-4000-8000-000000000001',
  v = '20000000-0000-4000-8000-000000000002',
  w = '20000000-0000-4000-8000-000000000003'
beforeAll(async () => {
  db = await baseDEssai()
  await db.exec(`
 insert into agences(id,nom,domaine) values('${a}','Agence A','a.invalid'),('${b}','Agence B','b.invalid');
 insert into auth.users(id,email,email_confirmed_at) values('${u}','admin@a.invalid',now()),('${v}','membre@a.invalid',now()),('${w}','admin@b.invalid',now());
 insert into membres_agence(agence_id,utilisateur_id,role) values('${a}','${u}','admin'),('${a}','${v}','membre'),('${b}','${w}','admin');
`)
})
afterAll(async () => {
  await db.close()
})
test('seul un administrateur lit son equipe et peut autoriser une readmission', async () => {
  await devenir(db, 'authenticated', v)
  expect(await refus(db, 'select * from collaborateurs_agence(0)')).toContain(
    'Administration refusee',
  )
  await devenir(db, 'authenticated', u)
  const lignes = (
    await db.query<{ utilisateur_id: string }>('select * from collaborateurs_agence(0)')
  ).rows
  expect(lignes.map((l) => l.utilisateur_id).sort()).toEqual([u, v])
  expect(
    (await db.query<{ ok: boolean }>(`select readmettre_collaborateur('${w}') as ok`)).rows[0]!.ok,
  ).toBe(false)
  await db.query(`delete from membres_agence where utilisateur_id='${v}'`)
  expect(
    (await db.query<{ etat: string }>('select * from collaborateurs_agence(0)')).rows.map(
      (l) => l.etat,
    ),
  ).toContain('exclu')
  expect(
    (await db.query<{ ok: boolean }>(`select readmettre_collaborateur('${v}') as ok`)).rows[0]!.ok,
  ).toBe(true)
  expect((await db.query('select * from journal_administration_agence')).rows).toHaveLength(2)
  await devenir(db, 'authenticated', w)
  expect((await db.query('select * from journal_administration_agence')).rows).toHaveLength(0)
})
test('une adresse devenue personnelle ne se divulgue pas a l ancienne agence', async () => {
  await redevenirProprietaire(db)
  await db.query(
    `insert into membres_agence(agence_id,utilisateur_id,role) values('${a}','${v}','membre')`,
  )
  await db.query(`update auth.users set email='personnel@ailleurs.invalid' where id='${v}'`)
  await devenir(db, 'authenticated', u)
  const cible = (
    await db.query<{ utilisateur_id: string; email: string | null; admissible: boolean }>(
      'select * from collaborateurs_agence(0)',
    )
  ).rows.find((l) => l.utilisateur_id === v)!
  expect(cible.email).toBeNull()
  expect(cible.admissible).toBe(false)
})

test('la maintenance retire les traces anciennes sans droit de suppression agence', async () => {
  await redevenirProprietaire(db)
  await db.query(
    `insert into journal_administration_agence(agence_id,cible_id,action,quand) values('${a}','${v}','role',now()-interval '91 days')`,
  )
  await devenir(db, 'authenticated', u)
  expect(await refus(db, 'delete from journal_administration_agence')).toContain(
    'permission denied',
  )
  await devenir(db, 'serveur')
  await db.query('select purger_les_dossiers_expires()')
  await redevenirProprietaire(db)
  expect(
    (
      await db.query(
        "select * from journal_administration_agence where quand<now()-interval '90 days'",
      )
    ).rows,
  ).toHaveLength(0)
})

test('aucun role applicatif ne consomme la sequence du journal', async () => {
  await redevenirProprietaire(db)
  for (const role of ['anon', 'authenticated', 'porteur_lien', 'serveur']) {
    const { rows } = await db.query<{ ok: boolean }>(
      "select has_sequence_privilege($1,'public.journal_administration_agence_id_seq','usage') as ok",
      [role],
    )
    expect(rows[0]!.ok).toBe(false)
  }
})
