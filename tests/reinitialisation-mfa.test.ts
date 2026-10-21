import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, expect, test } from 'vitest'
import { baseDEssai, devenir, redevenirProprietaire, refus, rejoindreAvecAccord } from './base'

/**
 * La reinitialisation du second facteur d'un collaborateur (0065).
 *
 * Le geste retire un facteur d'authentification : c'est une porte d'entree
 * pour qui l'obtiendrait a tort. Les tests portent donc d'abord sur les refus
 * (autre agence, membre simple, sans aal2, sur soi) avant le succes.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const LUC = '33333333-3333-3333-3333-333333333333'
const PAUL = '44444444-4444-4444-4444-444444444444'

let db: PGlite

async function etat() {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ facteurs: number; sessions: number; journal: string | null }>(`
    select (select count(*)::int from auth.mfa_factors where user_id = '${LUC}') as facteurs,
           (select count(*)::int from auth.sessions where user_id = '${LUC}') as sessions,
           (select string_agg(action, ',' order by action) from public.journal_administration_agence
             where action = 'mfa') as journal
  `)
  return rows[0]
}

beforeEach(async () => {
  db = await baseDEssai()
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${MARIE}', 'marie@agence-lyon3.fr', now()),
      ('${LUC}',   'luc@agence-lyon3.fr',   now()),
      ('${PAUL}',  'paul@autre-agence.fr',  now());
  `)
  await devenir(db, 'authenticated', MARIE)
  await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
  await devenir(db, 'authenticated', PAUL)
  await db.query(`select public.rejoindre_ou_creer_agence('Autre agence')`)
  await rejoindreAvecAccord(db, MARIE, LUC)
  await redevenirProprietaire(db)
  await db.exec(`
    insert into auth.mfa_factors (user_id) values ('${LUC}'), ('${LUC}'), ('${MARIE}');
    insert into auth.sessions (user_id, aal) values ('${LUC}', 'aal2'), ('${MARIE}', 'aal2');
  `)
})

test('un administrateur avec MFA retire les facteurs et les sessions de son collaborateur', async () => {
  await devenir(db, 'authenticated', MARIE)
  const { rows } = await db.query<{ ok: boolean }>(
    `select public.reinitialiser_mfa_collaborateur('${LUC}') as ok`,
  )
  expect(rows[0]!.ok).toBe(true)
  expect(await etat()).toEqual({ facteurs: 0, sessions: 0, journal: 'mfa' })

  // Les facteurs de l'administrateur ne sont pas touches.
  const { rows: marie } = await db.query<{ n: number }>(
    `select count(*)::int as n from auth.mfa_factors where user_id = '${MARIE}'`,
  )
  expect(marie[0]!.n).toBe(1)
})

test('un membre simple, un administrateur d une autre agence ou sans aal2 est refuse', async () => {
  await devenir(db, 'authenticated', LUC)
  expect(await refus(db, `select public.reinitialiser_mfa_collaborateur('${MARIE}')`)).toContain(
    'Administration refusee',
  )

  // Paul administre sa propre agence : Luc n'y figure pas.
  await devenir(db, 'authenticated', PAUL)
  const { rows } = await db.query<{ ok: boolean }>(
    `select public.reinitialiser_mfa_collaborateur('${LUC}') as ok`,
  )
  expect(rows[0]!.ok).toBe(false)

  // Marie sans second facteur dans sa session.
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role: 'authenticated', sub: MARIE, aal: 'aal1' }),
  ])
  expect(await refus(db, `select public.reinitialiser_mfa_collaborateur('${LUC}')`)).toContain(
    'Administration refusee',
  )

  expect(await etat()).toEqual({ facteurs: 2, sessions: 1, journal: null })
})

test('jamais sur soi ni sur une personne sortie de l agence', async () => {
  await devenir(db, 'authenticated', MARIE)
  const { rows: soi } = await db.query<{ ok: boolean }>(
    `select public.reinitialiser_mfa_collaborateur('${MARIE}') as ok`,
  )
  expect(soi[0]!.ok).toBe(false)

  await db.query(
    `delete from public.membres_agence where utilisateur_id = '${LUC}' and role = 'membre'`,
  )
  const { rows: sorti } = await db.query<{ ok: boolean }>(
    `select public.reinitialiser_mfa_collaborateur('${LUC}') as ok`,
  )
  expect(sorti[0]!.ok).toBe(false)
  expect(await etat()).toEqual({ facteurs: 2, sessions: 1, journal: null })
})

test('ni le demandeur ni un anonyme n appellent la fonction', async () => {
  await devenir(db, 'anon')
  expect(await refus(db, `select public.reinitialiser_mfa_collaborateur('${LUC}')`)).toContain(
    'permission denied',
  )
  await devenir(db, 'serveur')
  expect(await refus(db, `select public.reinitialiser_mfa_collaborateur('${LUC}')`)).toContain(
    'permission denied',
  )
})
