import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { baseDEssai } from './base'
import { schemaConforme, type EmpreinteSchema } from '@/lib/exploitation/schema'
import reference from './fixtures/schema-locale.json'
let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
})
afterEach(async () => {
  await db.exec('rollback')
})
async function lire() {
  return (
    await db.query<{ empreinte: EmpreinteSchema }>('select public.empreinte_schema() as empreinte')
  ).rows[0]!.empreinte
}
for (const role of ['anon', 'authenticated', 'porteur_lien', 'depot_piece']) {
  test(`le role ${role} ne lit pas les empreintes du schema`, async () => {
    await db.exec(`set local role ${role}`)
    await expect(lire()).rejects.toThrow(/permission denied/)
  })
}
test('le schema reconstruit correspond a la reference locale approuvee', async () => {
  await db.exec('set local role serveur')
  expect(schemaConforme(await lire(), reference)).toBe(true)
})
const alterations = [
  ['tables', 'alter table public.dossiers disable row level security'],
  ['fonctions', 'grant execute on function public.rapport_exploitation() to anon'],
  ['colonnes', "alter table public.dossiers alter column reference set default 'insecure'"],
  ['contraintes', 'alter table public.dossiers drop constraint dossiers_reference_key'],
  ['politiques', 'create policy intrusion on storage.objects for select to anon using (true)'],
  ['declencheurs', 'alter table public.pieces disable trigger b_piece_reservation'],
  ['indexes', 'drop index public.journal_acces_supervision_idx'],
  ['roles', 'alter role serveur bypassrls'],
  ['adhesions', 'grant serveur to authenticated'],
  ['stockage', 'alter table storage.objects disable row level security'],
  ['bucket', "update storage.buckets set public=true where id='pieces'"],
  ['schema', 'grant create on schema public to anon'],
] as const
for (const [categorie, sql] of alterations) {
  test(`une derive ${categorie} n est pas un schema conforme`, async () => {
    const avant = await lire()
    await db.exec(sql)
    const apres = await lire()
    expect(apres.empreintes[categorie]).not.toBe(avant.empreintes[categorie])
    expect(schemaConforme(apres, reference)).toBe(false)
  })
}
test('une donnee de dossier ne change pas le catalogue et ne sort pas dans le rapport', async () => {
  const avant = await lire()
  await db.exec("insert into dossiers(email_locataire) values ('prive@audit.invalid')")
  const apres = await lire()
  expect(apres).toEqual(avant)
  expect(JSON.stringify(apres)).not.toContain('prive@audit.invalid')
})
test('une adhesion privilegiee indirecte du role agence ne passe pas inapercue', async () => {
  const avant = await lire()
  await db.exec('grant service_role to authenticated')
  const apres = await lire()
  expect(apres.empreintes.adhesions).not.toBe(avant.empreintes.adhesions)
  expect(schemaConforme(apres, reference)).toBe(false)
})

for (const [categorie, sql] of [
  ['colonnes', 'grant select (email_locataire) on public.dossiers to anon'],
  ['stockage', 'grant select (name) on storage.objects to anon'],
  ['tables', 'create materialized view public.intrusion as select 1 as secret'],
  ['tables', 'create table public.partition_intrusion (id int) partition by range (id)'],
  ['schema', 'alter default privileges in schema public grant select on tables to porteur_lien'],
] as const) {
  test(`un changement de catalogue supplementaire est detecte : ${sql}`, async () => {
    const avant = await lire()
    await db.exec(sql)
    const apres = await lire()
    expect(apres.empreintes[categorie]).not.toBe(avant.empreintes[categorie])
    expect(schemaConforme(apres, reference)).toBe(false)
  })
}
