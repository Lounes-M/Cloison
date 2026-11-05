import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'

let db: PGlite, admin: string, membre: string, second: string, dossier: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  await db.exec(
    readFileSync('supabase/essais/responsables.sql', 'utf8').split(
      'set local role authenticated;',
    )[0]!,
  )
  const r = (
    await db.query<{ a: string; m: string; s: string; d: string }>(
      "select current_setting('cloison.responsable_admin') a,current_setting('cloison.responsable_premier') m,current_setting('cloison.responsable_second') s,current_setting('cloison.responsable_dossier') d",
    )
  ).rows[0]!
  admin = r.a
  membre = r.m
  second = r.s
  dossier = r.d
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function ajouter(qui: string, texte: string, le = dossier) {
  await devenir(db, 'authenticated', qui)
  return (
    await db.query<{ id: string | null }>('select ajouter_note_dossier($1,$2) id', [le, texte])
  ).rows[0]!.id
}
async function lire(qui: string) {
  await devenir(db, 'authenticated', qui)
  return (
    await db.query<{
      id: string
      texte: string
      auteur_email: string | null
      supprimable: boolean
    }>('select * from notes_du_dossier($1)', [dossier])
  ).rows
}
async function supprimer(qui: string, note: string) {
  await devenir(db, 'authenticated', qui)
  return (await db.query<{ ok: boolean }>('select supprimer_note_dossier($1) ok', [note])).rows[0]!
    .ok
}

test('les collaborateurs partagent les notes, les plus recentes d abord', async () => {
  const premiere = await ajouter(membre, '  Garant appelé, pièces promises pour lundi.  ')
  expect(premiere).toMatch(/^[0-9a-f-]{36}$/)
  await ajouter(second, 'Relancé par SMS.')
  const vues = await lire(admin)
  expect(vues.map((n) => n.texte)).toEqual([
    'Relancé par SMS.',
    'Garant appelé, pièces promises pour lundi.',
  ])
  expect(vues[1]!.auteur_email).toMatch(/@responsable-/)
  expect(vues.every((n) => n.supprimable)).toBe(true)
  const parMembre = await lire(membre)
  expect(parMembre.map((n) => n.supprimable)).toEqual([false, true])
})

test('une note vide, trop longue ou hors agence est refusee', async () => {
  expect(await ajouter(membre, '   ')).toBeNull()
  expect(await ajouter(membre, 'x'.repeat(1001))).toBeNull()
  expect(await ajouter(membre, 'ok', '00000000-0000-4000-8000-000000000000')).toBeNull()
  await redevenirProprietaire(db)
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'x@ailleurs.invalid',now())",
  )
  const autre = (
    await db.query<{ u: string }>(
      "with a as (insert into agences(nom,domaine) values('Ailleurs','ailleurs.invalid') returning id) insert into membres_agence(agence_id,utilisateur_id,role) select a.id,u.id,'admin' from a, auth.users u where u.email='x@ailleurs.invalid' returning utilisateur_id u",
    )
  ).rows[0]!.u
  expect(await ajouter(autre, 'intrusion')).toBeNull()
  await ajouter(membre, 'interne')
  expect(await lire(autre)).toEqual([])
})

test('seuls l auteur et un administrateur suppriment une note', async () => {
  const note = (await ajouter(membre, 'À supprimer'))!
  expect(await supprimer(second, note)).toBe(false)
  expect(await supprimer(membre, note)).toBe(true)
  const autre = (await ajouter(second, 'Par un collègue'))!
  expect(await supprimer(admin, autre)).toBe(true)
  expect(await lire(admin)).toEqual([])
})

test('un dossier echu ne montre ni ne recoit plus de notes, et la purge du coffre les efface', async () => {
  await ajouter(membre, 'Avant échéance')
  await redevenirProprietaire(db)
  await db.query('update dossiers set coffre_purge_le=now() where id=$1', [dossier])
  expect((await db.query('select 1 from notes_dossiers')).rows).toHaveLength(0)
  await ajouter(membre, 'Encore une')
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '2 days',expire_le=now()-interval '1 second' where id=$1",
    [dossier],
  )
  expect(await lire(membre)).toEqual([])
  expect(await ajouter(membre, 'Trop tard')).toBeNull()
})

test('la table reste fermee et les fonctions reservees aux collaborateurs', async () => {
  await redevenirProprietaire(db)
  for (const role of ['anon', 'authenticated', 'porteur_lien', 'serveur', 'service_role']) {
    expect(
      (
        await db.query<{ p: boolean }>(
          "select has_table_privilege($1,'public.notes_dossiers','select,insert,update,delete') p",
          [role],
        )
      ).rows[0]!.p,
    ).toBe(false)
  }
  for (const role of ['anon', 'porteur_lien', 'depot_piece', 'serveur', 'service_role'])
    for (const fn of [
      'public.notes_du_dossier(uuid)',
      'public.ajouter_note_dossier(uuid,text)',
      'public.supprimer_note_dossier(uuid)',
    ])
      expect(
        (
          await db.query<{ p: boolean }>("select has_function_privilege($1,$2,'execute') p", [
            role,
            fn,
          ])
        ).rows[0]!.p,
      ).toBe(false)
})
