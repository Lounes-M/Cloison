import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'

let db: PGlite, dossier: string, admin: string, agence: string, membre: string, reference: string

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
    await db.query<{ d: string; u: string; a: string; r: string }>(
      "select current_setting('cloison.ocr_dossier') d,current_setting('cloison.ocr_membre') u,d.agence_id a,d.reference r from dossiers d where d.id=current_setting('cloison.ocr_dossier')::uuid",
    )
  ).rows[0]!
  dossier = r.d
  admin = r.u
  agence = r.a
  reference = r.r
  membre = randomUUID()
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) select $1::uuid,$1::uuid::text||'@'||domaine,now() from agences where id=$2",
    [membre, agence],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'membre')",
    [agence, membre],
  )
  await db.query(
    "update dossiers set email_garant='garant@example.invalid',statut='depot_en_cours',cree_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await db.query(
    "insert into jetons_actifs(dossier_id,partie,jti,expire_le) values($1,'locataire',gen_random_uuid(),now()+interval '7 days'),($1,'garant',gen_random_uuid(),now()+interval '7 days')",
    [dossier],
  )
  await db.query(
    "insert into cles_dossier(dossier_id,cle_scellee) values($1,decode(repeat('ab',60),'hex'))",
    [dossier],
  )
  await db.query(
    "insert into notifications_statut(dossier_id,statut) values($1,'depot_en_cours')",
    [dossier],
  )
  await devenir(db, 'authenticated', admin)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function clore(ref: string | null = reference, d = dossier) {
  return (
    await db.query<{ r: Record<string, string | null> | null }>('select clore_dossier($1,$2) r', [
      d,
      ref,
    ])
  ).rows[0]!.r
}

async function etat() {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{
    statut: string
    echu: boolean
    jetons: number
    cles: number
    notifications: number
  }>(
    `select d.statut, d.expire_le<=clock_timestamp() echu,
       (select count(*)::int from jetons_actifs where dossier_id=d.id) jetons,
       (select count(*)::int from cles_dossier where dossier_id=d.id) cles,
       (select count(*)::int from notifications_statut where dossier_id=d.id) notifications
     from dossiers d where d.id=$1`,
    [dossier],
  )
  return rows[0]
}

test("un administrateur clot : statut, echeance, jetons, cle et notifications d'un coup", async () => {
  expect(await clore()).toEqual({
    reference,
    email_locataire: 'ocr@example.invalid',
    email_garant: 'garant@example.invalid',
    email_second_garant: null,
  })
  expect(await etat()).toEqual({
    statut: 'expire',
    echu: true,
    jetons: 0,
    cles: 0,
    notifications: 0,
  })
})

test("le dossier clos disparait aussitot pour l'agence et part a la purge suivante", async () => {
  expect(await clore()).not.toBeNull()
  const { rows } = await db.query('select id from dossiers where id=$1', [dossier])
  expect(rows).toEqual([])
  expect(await clore()).toBeNull()
  await redevenirProprietaire(db)
  await db.query('select purger_les_dossiers_expires()')
  expect((await db.query('select id from dossiers where id=$1', [dossier])).rows).toEqual([])
  expect(
    (await db.query("select 1 from objets_a_supprimer where chemin like $1||'/%'", [dossier])).rows,
  ).toHaveLength(1)
})

test('une reference mal retapee ne clot rien', async () => {
  expect(await clore(`${reference}x`)).toBeNull()
  expect(await clore('')).toBeNull()
  expect(await clore(null)).toBeNull()
  expect(await etat()).toMatchObject({ statut: 'depot_en_cours', echu: false, jetons: 2, cles: 1 })
})

test('un membre ne clot que le dossier dont il est responsable', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await clore()).toBeNull()
  expect(await etat()).toMatchObject({ statut: 'depot_en_cours', cles: 1 })
  await db.query('insert into affectations_dossiers(dossier_id,membre_id) values($1,$2)', [
    dossier,
    membre,
  ])
  await devenir(db, 'authenticated', membre)
  expect(await clore()).not.toBeNull()
  expect(await etat()).toMatchObject({ statut: 'expire', cles: 0 })
})

test.each(['transmis', 'signe', 'expire'])('un dossier %s ne se clot pas', async (statut) => {
  await redevenirProprietaire(db)
  await db.query('update dossiers set statut=$2 where id=$1', [dossier, statut])
  await devenir(db, 'authenticated', admin)
  expect(await clore()).toBeNull()
  expect(await etat()).toMatchObject({ statut, cles: 1, jetons: 2 })
})

test('un dossier refuse se clot, pas la demonstration', async () => {
  await redevenirProprietaire(db)
  await db.query("update dossiers set statut='refuse' where id=$1", [dossier])
  await devenir(db, 'authenticated', admin)
  expect(await clore()).not.toBeNull()
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set demonstration=true,statut='ouvert',expire_le=now()+interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', admin)
  expect(await clore()).toBeNull()
})

test('sans aal2 ou depuis une autre agence, rien ne se clot', async () => {
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: 'authenticated', sub: admin, aal: 'aal1' }),
  ])
  expect(await clore()).toBeNull()
  const autre = randomUUID()
  const autreAgence = randomUUID()
  await redevenirProprietaire(db)
  await db.query("insert into agences(id,nom,domaine) values($1,'Autre','autre-cloture.invalid')", [
    autreAgence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@autre-cloture.invalid',now())",
    [autre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [autreAgence, autre],
  )
  await devenir(db, 'authenticated', autre)
  expect(await clore()).toBeNull()
  expect(await etat()).toMatchObject({ statut: 'depot_en_cours', cles: 1, jetons: 2 })
})

test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne peut pas appeler la cloture',
  async (role) => {
    await redevenirProprietaire(db)
    await db.exec(`set role ${role}`)
    await expect(db.query('select clore_dossier($1,$2)', [dossier, reference])).rejects.toThrow(
      /permission denied/,
    )
  },
)
