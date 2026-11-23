import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { baseDEssai, devenir, redevenirProprietaire } from './base'

/**
 * Migration 0086 : ce qui tient la charge ne doit pas se defaire en silence.
 *
 * Une politique ecrite plus tard avec `public.agence_courante()` nu marcherait,
 * et ralentirait seulement le jour ou la table est grande. Ce fichier le refuse
 * des l'ecriture.
 */

let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})

test('aucune politique ne recalcule l identite a chaque ligne', async () => {
  await db.exec("set search_path=''")
  const { rows } = await db.query<{ nom: string; texte: string }>(
    `select schemaname||'.'||tablename||' : '||policyname as nom,
            coalesce(qual,'')||' '||coalesce(with_check,'') as texte
       from pg_policies
      where schemaname='public' or (schemaname='storage' and tablename='objects')`,
  )
  await db.exec('reset search_path')
  expect(rows.length).toBeGreaterThan(50)
  const identite =
    /(public\.(?:agence_courante|est_admin_agence|dossier_courant|partie_courante)|auth\.uid)\(\)/g
  const nues = rows.filter(({ texte }) =>
    [...texte.matchAll(identite)].some(
      (appel) => !/SELECT\s+$/i.test(texte.slice(0, appel.index).slice(-12)),
    ),
  )
  expect(nues.map((p) => p.nom)).toEqual([])
})

test('la liste d une agence passe par un plan initial et son index', async () => {
  await redevenirProprietaire(db)
  await db.exec('set enable_seqscan=off')
  await devenir(db, 'authenticated', '00000000-0000-4000-8000-000000000001')
  const { rows } = await db.query<{ 'QUERY PLAN': string }>(
    'explain select id from public.dossiers order by cree_le desc, id desc limit 51',
  )
  await redevenirProprietaire(db)
  await db.exec('reset enable_seqscan')
  const plan = rows.map((r) => r['QUERY PLAN']).join('\n')
  expect(plan).toMatch(/InitPlan/)
  expect(plan).toMatch(/dossiers_agence_recents/)
})

test('la purge traite un lot borne et laisse la suite au passage suivant', async () => {
  await redevenirProprietaire(db)
  await db.exec(
    `insert into public.dossiers (email_locataire, cree_le, expire_le)
     select 'lot'||n||'@essai.invalid', now()-interval '100 days', now()-interval '1 day'
       from generate_series(1, 230) n`,
  )
  await devenir(db, 'serveur')
  const premier = await db.query<{ n: number }>('select public.purger_les_dossiers_expires() as n')
  const second = await db.query<{ n: number }>('select public.purger_les_dossiers_expires() as n')
  await redevenirProprietaire(db)
  expect(premier.rows[0]!.n).toBe(200)
  expect(second.rows[0]!.n).toBe(30)
  const reste = await db.query<{ n: number }>(
    'select count(*)::int as n from public.dossiers where expire_le < now()',
  )
  expect(reste.rows[0]!.n).toBe(0)
})

test('les seaux de debit abandonnes sont effaces, les recents restent', async () => {
  await redevenirProprietaire(db)
  await db.exec(
    `insert into public.debits (cle, fenetre, compte) values
       ('demande_agence:ancien', now()-interval '3 days', 1),
       ('demande_agence:recent', now()-interval '10 minutes', 1)`,
  )
  await devenir(db, 'serveur')
  await db.query('select public.purger_les_dossiers_expires()')
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ cle: string }>('select cle from public.debits order by cle')
  expect(rows.map((r) => r.cle)).toEqual(['demande_agence:recent'])
})
