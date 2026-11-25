import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { baseDEssai } from './base'

let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})

test('les quatre fonctions ont un search_path vide', async () => {
  const { rows } = await db.query<{ nom: string; config: string[] | null }>(`
    select p.proname as nom, p.proconfig as config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'recalculer_colocation',
        'recalculer_dossier',
        'agence_reinitialise_verification',
        'journal_est_en_ecriture_seule'
      )
  `)
  expect(rows.map((r) => r.nom).sort()).toEqual([
    'agence_reinitialise_verification',
    'journal_est_en_ecriture_seule',
    'recalculer_colocation',
    'recalculer_dossier',
  ])
  for (const row of rows) {
    expect(row.config?.some((c) => c === 'search_path=' || c === 'search_path=""')).toBe(true)
  }
  await db.query(`select public.recalculer_dossier('00000000-0000-4000-8000-000000000001'::uuid)`)
  await db.query(
    `select public.recalculer_colocation('00000000-0000-4000-8000-000000000002'::uuid)`,
  )
})

test('rls_auto_enable, si elle existe, n est pas executable par anon ni authenticated', async () => {
  await db.exec('begin')
  try {
    await db.exec(`
      create function public.rls_auto_enable() returns void
      language plpgsql security definer set search_path = ''
      as $$ begin end $$;
      grant execute on function public.rls_auto_enable() to anon, authenticated;
    `)
    await db.exec(`
      do $$ begin
        if to_regprocedure('public.rls_auto_enable()') is not null then
          execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
        end if;
      end $$;
    `)
    const { rows } = await db.query<{ anon: boolean; auth: boolean }>(`
      select
        has_function_privilege('anon', 'public.rls_auto_enable()', 'execute') as anon,
        has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute') as auth
    `)
    expect(rows[0]).toEqual({ anon: false, auth: false })
  } finally {
    await db.exec('rollback')
  }
})
