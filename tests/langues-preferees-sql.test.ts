import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'

/**
 * La langue preferee (migration 0083) : qui peut la regler, qui peut la lire,
 * et ce que recoit une adresse que la base ne connait pas.
 */
let db: PGlite, dossier: string, membre: string, locataire: string

async function valeur<T>(sql: string, parametres: unknown[] = []): Promise<T> {
  const { rows } = await db.query<Record<string, T>>(sql, parametres)
  return Object.values(rows[0] ?? {})[0] as T
}

/** Un refus, sans perdre la transaction du test : on revient au point de reprise. */
async function refus(_db: PGlite, sql: string): Promise<string> {
  await db.exec('savepoint avant_refus')
  try {
    await db.query(sql)
  } catch (erreur) {
    await db.exec('rollback to savepoint avant_refus')
    return erreur instanceof Error ? erreur.message : String(erreur)
  }
  throw new Error(`Cette requete aurait du etre refusee : ${sql}`)
}

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
    await db.query<{ d: string; u: string; l: string }>(
      "select current_setting('cloison.ocr_dossier') d,current_setting('cloison.ocr_membre') u,d.email_locataire l from dossiers d where d.id=current_setting('cloison.ocr_dossier')::uuid",
    )
  ).rows[0]!
  dossier = r.d
  membre = r.u
  locataire = r.l
  await db.query("update dossiers set email_garant='garant@example.invalid' where id=$1", [dossier])
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

test('le serveur regle et relit la langue d’un porteur, partie par partie', async () => {
  await devenir(db, 'serveur')
  expect(await valeur('select public.langue_dossier($1,$2)', [dossier, 'garant'])).toBeNull()
  expect(
    await valeur('select public.regler_langue_dossier($1,$2,$3)', [dossier, 'garant', 'en']),
  ).toBe(true)
  expect(await valeur('select public.langue_dossier($1,$2)', [dossier, 'garant'])).toBe('en')
  expect(await valeur('select public.langue_dossier($1,$2)', [dossier, 'locataire'])).toBeNull()
  // Un second reglage remplace le premier.
  await db.query('select public.regler_langue_dossier($1,$2,$3)', [dossier, 'garant', 'fr'])
  expect(await valeur('select public.langue_dossier($1,$2)', [dossier, 'garant'])).toBe('fr')
})

test('une langue, une partie ou un dossier inconnus ne reglent rien', async () => {
  await devenir(db, 'serveur')
  for (const [d, partie, langue] of [
    [dossier, 'garant', 'de'],
    [dossier, 'agence', 'en'],
    ['00000000-0000-4000-8000-000000000000', 'garant', 'en'],
  ])
    expect(await valeur('select public.regler_langue_dossier($1,$2,$3)', [d, partie, langue])).toBe(
      false,
    )
  await redevenirProprietaire(db)
  expect(await valeur('select count(*)::int from public.langues_dossiers')).toBe(0)
})

test('un dossier echu ne recoit plus de langue', async () => {
  await db.query(
    "update dossiers set cree_le=now()-interval '2 days', expire_le=now()-interval '1 minute' where id=$1",
    [dossier],
  )
  await devenir(db, 'serveur')
  expect(
    await valeur('select public.regler_langue_dossier($1,$2,$3)', [dossier, 'garant', 'en']),
  ).toBe(false)
})

test('un collaborateur regle sa propre langue, et elle seule', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await valeur('select public.ma_langue()')).toBeNull()
  expect(await valeur("select public.regler_ma_langue('en')")).toBe(true)
  expect(await valeur('select public.ma_langue()')).toBe('en')
  expect(await valeur("select public.regler_ma_langue('es')")).toBe(false)
  expect(await valeur('select public.ma_langue()')).toBe('en')
})

test('un compte sans agence ne regle rien', async () => {
  const inconnu = '99999999-9999-4999-8999-999999999999'
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'seul@example.invalid',now())",
    [inconnu],
  )
  await devenir(db, 'authenticated', inconnu)
  expect(await valeur("select public.regler_ma_langue('en')")).toBe(false)
})

test('les courriels lisent la langue de chaque destinataire, le francais par defaut', async () => {
  const courrielMembre = await valeur<string>('select email from auth.users where id=$1', [membre])
  await devenir(db, 'serveur')
  await db.query('select public.regler_langue_dossier($1,$2,$3)', [dossier, 'garant', 'en'])
  await devenir(db, 'authenticated', membre)
  await db.query("select public.regler_ma_langue('en')")
  await devenir(db, 'serveur')
  const { rows } = await db.query<{ adresse: string; langue: string }>(
    'select adresse, langue from public.langues_courriels($1,$2)',
    [dossier, ['GARANT@example.invalid', locataire, courrielMembre, 'inconnu@example.invalid']],
  )
  expect(Object.fromEntries(rows.map((r) => [r.adresse, r.langue]))).toEqual({
    'GARANT@example.invalid': 'en',
    [locataire]: 'fr',
    [courrielMembre]: 'en',
    'inconnu@example.invalid': 'fr',
  })
})

test('les tables et les fonctions sont fermees aux autres roles', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien', 'serveur'] as const) {
    await devenir(db, role, membre)
    expect(await refus(db, 'select * from public.langues_dossiers')).toMatch(/permission denied/)
    expect(await refus(db, 'select * from public.langues_membres')).toMatch(/permission denied/)
  }
  await devenir(db, 'anon')
  expect(await refus(db, "select public.regler_ma_langue('en')")).toMatch(/permission denied/)
  await devenir(db, 'authenticated', membre)
  expect(
    await refus(db, `select public.regler_langue_dossier('${dossier}','garant','en')`),
  ).toMatch(/permission denied/)
  expect(await refus(db, `select * from public.langues_courriels('${dossier}','{}')`)).toMatch(
    /permission denied/,
  )
  await devenir(db, 'porteur_lien')
  expect(await refus(db, `select public.langue_dossier('${dossier}','garant')`)).toMatch(
    /permission denied/,
  )
})

test('la langue disparait avec le dossier et avec l’appartenance', async () => {
  const { rows } = await db.query<{ table: string; suppression: string }>(
    `select conrelid::regclass::text as table, confdeltype as suppression
       from pg_constraint
      where contype = 'f' and conrelid in ('public.langues_dossiers'::regclass, 'public.langues_membres'::regclass)
      order by 1`,
  )
  expect(rows).toEqual([
    { table: 'langues_dossiers', suppression: 'c' },
    { table: 'langues_membres', suppression: 'c' },
  ])
})
