import { afterEach, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'

let db: PGlite
let agence: string
let premier: string
let second: string
beforeEach(async () => {
  db = await baseDEssai()
  const a = await db.query<{ id: string }>(
    "insert into public.agences(nom,domaine) values ('Essai','administration.invalid') returning id",
  )
  agence = a.rows[0]!.id
  const u = await db.query<{ id: string }>(
    "insert into auth.users(email,email_confirmed_at) values ('premier@administration.invalid',now()),('second@administration.invalid',now()) returning id",
  )
  premier = u.rows[0]!.id
  second = u.rows[1]!.id
  await db.query(
    "insert into public.membres_agence(agence_id,utilisateur_id,role) values ($1,$2,'admin'),($1,$3,'membre')",
    [agence, premier, second],
  )
  await devenir(db, 'authenticated', premier)
})
afterEach(async () => {
  if (db) await db.close()
})

test('le dernier administrateur ne peut pas se retrograder', async () => {
  expect(
    await refus(
      db,
      `update public.membres_agence set role='membre' where utilisateur_id='${premier}'`,
    ),
  ).toContain('dernier administrateur')
})

test('une suppression du dernier administrateur est refusee meme hors de la RLS', async () => {
  await redevenirProprietaire(db)
  expect(
    await refus(db, `delete from public.membres_agence where utilisateur_id='${premier}'`),
  ).toContain('dernier administrateur')
})

test('passer le relais conserve un administrateur et permet la retrogradation', async () => {
  await db.query("update public.membres_agence set role='admin' where utilisateur_id=$1", [second])
  await db.query("update public.membres_agence set role='membre' where utilisateur_id=$1", [
    premier,
  ])
  const { rows } = await db.query(
    "select utilisateur_id from public.membres_agence where role='admin'",
  )
  expect(rows).toEqual([{ utilisateur_id: second }])
  await devenir(db, 'authenticated', second)
  expect(
    await refus(
      db,
      `update public.membres_agence set role='membre' where utilisateur_id='${second}'`,
    ),
  ).toContain('dernier administrateur')
})

test('une suppression administrative de l agence ne laisse pas de membre orphelin', async () => {
  await redevenirProprietaire(db)
  await db.query('delete from public.agences where id=$1', [agence])
  expect(
    (await db.query('select 1 from public.membres_agence where agence_id=$1', [agence])).rows,
  ).toHaveLength(0)
})
