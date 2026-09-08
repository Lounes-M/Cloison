import { expect, test } from 'vitest'
import { baseDEssai } from './base'

test('les droits Supabase par defaut ne rouvrent pas les fonctions internes', async () => {
  const db = await baseDEssai()
  const interdites = [
    'versionner_conditions()',
    'retrouver_lien_locataire(text,text)',
    'purger_les_dossiers_expires()',
    'pieces_suffisantes(uuid)',
    'recalculer_dossier(uuid)',
    'marquer_dossier_paye(uuid,text)',
  ]
  for (const role of ['anon', 'authenticated', 'porteur_lien']) {
    for (const fonction of interdites) {
      const { rows } = await db.query<{ autorise: boolean }>(
        `select has_function_privilege($1, $2, 'execute') as autorise`,
        [role, `public.${fonction}`],
      )
      expect(rows[0]?.autorise, `${role} / ${fonction}`).toBe(false)
    }
  }
  await db.close()
})

test('aucune fonction applicative nouvelle ne devient publique implicitement', async () => {
  const db = await baseDEssai()
  try {
    const { rows } = await db.query<{ nom: string }>(`
      select p.proname as nom from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')
        and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass
          and d.objid=p.oid and d.deptype='e')
    `)
    expect(rows).toEqual([])
  } finally {
    await db.close()
  }
})
