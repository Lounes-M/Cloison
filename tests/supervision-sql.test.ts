import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { baseDEssai } from './base'
import type { RapportSupervision } from '@/lib/exploitation/supervision.mjs'
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
async function rapport() {
  return (
    await db.query<{ rapport: RapportSupervision }>(
      'select public.rapport_exploitation() as rapport',
    )
  ).rows[0]!.rapport
}
async function fixture() {
  const u = (
    await db.query<{ id: string }>(
      "insert into auth.users(email,email_confirmed_at) values ('confidentiel@audit.invalid',now()) returning id",
    )
  ).rows[0]!.id
  const d = (
    await db.query<{ id: string }>(
      "insert into dossiers(email_locataire) values ('locataire@audit.invalid') returning id",
    )
  ).rows[0]!.id
  return { u, d }
}
async function ouvertures(u: string, d: string, n: number, quand = 'now()') {
  await db.query(
    `insert into journal_acces(dossier_id,action,acteur,acteur_id,quand) select $1,'piece_ouverte','agence',$2,${quand} from generate_series(1,$3::int)`,
    [d, u, n],
  )
}
for (const role of ['anon', 'authenticated', 'porteur_lien', 'depot_piece']) {
  test(`le role ${role} ne lit aucun rapport global`, async () => {
    await db.exec(`set local role ${role}`)
    await expect(rapport()).rejects.toThrow(/permission denied/)
  })
}
test('le serveur lit seulement le contrat agrege, meme sur base vide', async () => {
  await db.exec('set local role serveur')
  expect(await rapport()).toEqual({
    version: 1,
    alertes: {
      collaborateurs_acces_intensifs: 0,
      dossiers_acces_intensifs: 0,
      purges_en_retard: 0,
      courriels_a_reconcilier: 0,
    },
    pilote: {
      jours: 28,
      dossiers_presents: 0,
      avec_agence: 0,
      garant_designe: 0,
      avec_piece_presente: 0,
      complets_ou_transmis: 0,
      marques_signes: 0,
    },
  })
})
test('les seuils 50 et 100 declenchent sans publier acteur ni dossier', async () => {
  const { u, d } = await fixture()
  await ouvertures(u, d, 49)
  expect((await rapport()).alertes.dossiers_acces_intensifs).toBe(0)
  await ouvertures(u, d, 1)
  expect((await rapport()).alertes.dossiers_acces_intensifs).toBe(1)
  expect((await rapport()).alertes.collaborateurs_acces_intensifs).toBe(0)
  await ouvertures(u, d, 50)
  const r = await rapport()
  expect(r.alertes.collaborateurs_acces_intensifs).toBe(1)
  for (const prive of [u, d, 'confidentiel@audit.invalid', 'locataire@audit.invalid'])
    expect(JSON.stringify(r)).not.toContain(prive)
})
test('les acces anciens, futurs et de demonstration ne declenchent pas', async () => {
  const { u, d } = await fixture()
  await ouvertures(u, d, 100, "now()-interval '61 minutes'")
  await ouvertures(u, d, 100, "now()+interval '1 minute'")
  const a = (
    await db.query<{ id: string }>(
      "insert into agences(nom,domaine) values ('Demo','demo.invalid') returning id",
    )
  ).rows[0]!.id
  const demo = (
    await db.query<{ id: string }>(
      "insert into dossiers(email_locataire,agence_id,demonstration) values ('demo@audit.invalid',$1,true) returning id",
      [a],
    )
  ).rows[0]!.id
  await ouvertures(u, demo, 100)
  expect((await rapport()).alertes.collaborateurs_acces_intensifs).toBe(0)
  expect((await rapport()).alertes.dossiers_acces_intensifs).toBe(0)
  expect((await rapport()).pilote.dossiers_presents).toBe(1)
})
test('les files recentes ou envoyees ne sont pas des alertes et le rapport ne les modifie pas', async () => {
  await db.exec(
    "insert into objets_a_supprimer(chemin,cree_le) values ('ancien',now()-interval '61 minutes'),('recent',now()); insert into courriels_sortants(id,contenu,premier_essai,envoye_le,a_reconcilier) values (gen_random_uuid(),'chiffre',now()-interval '24 hours',null,false),(gen_random_uuid(),'chiffre',now(),null,false),(gen_random_uuid(),null,now()-interval '24 hours',now(),true)",
  )
  const avant = await db.query('select * from courriels_sortants order by id')
  const r = await rapport()
  expect(r.alertes.purges_en_retard).toBe(1)
  expect(r.alertes.courriels_a_reconcilier).toBe(1)
  expect((await db.query('select * from courriels_sortants order by id')).rows).toEqual(avant.rows)
})
test('la cohorte ne compte ni les vieux dossiers ni le futur et ne contient aucun taux invente', async () => {
  await db.exec(
    "insert into dossiers(email_locataire,cree_le,expire_le) values ('ancien@audit.invalid',now()-interval '29 days',now()+interval '1 day'),('futur@audit.invalid',now()+interval '1 day',now()+interval '2 days'); insert into dossiers(email_locataire,email_garant) values ('courant@audit.invalid','garant@audit.invalid')",
  )
  const r = await rapport()
  expect(r.pilote.dossiers_presents).toBe(1)
  expect(r.pilote.garant_designe).toBe(1)
  expect(r.pilote.complets_ou_transmis).toBe(0)
  expect(r.pilote.marques_signes).toBe(0)
})
