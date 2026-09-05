import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { baseDEssai } from './base'

let db: PGlite
let dossier: string
let agence: string
let membre: string
let jti: string
async function proprietaire() {
  await db.exec("reset role; set request.jwt.claims = '{}'")
}
async function porteur(partie = 'garant', token = jti) {
  await proprietaire()
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role: 'porteur_lien', dossier_id: dossier, role_partie: partie, jti: token }),
  ])
  await db.exec('set role porteur_lien')
}
async function collaborateur() {
  await proprietaire()
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal2' }),
  ])
  // Compatibilite avec le harnais precedent pendant le test rouge.
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [membre])
  await db.exec('set role authenticated')
}
beforeEach(async () => {
  db = await baseDEssai()
  agence = (
    await db.query<{ id: string }>(
      "insert into public.agences(nom,domaine) values ('Audit','audit.invalid') returning id",
    )
  ).rows[0]!.id
  membre = (
    await db.query<{ id: string }>(
      "insert into auth.users(email,email_confirmed_at) values ('membre@audit.invalid',now()) returning id",
    )
  ).rows[0]!.id
  await db.query(
    "insert into public.membres_agence(agence_id,utilisateur_id,role) values ($1,$2,'membre')",
    [agence, membre],
  )
  dossier = (
    await db.query<{ id: string }>(
      "insert into public.dossiers(agence_id,email_locataire,email_garant,loyer_cents) values ($1,'locataire@audit.invalid','garant@audit.invalid',100000) returning id",
      [agence],
    )
  ).rows[0]!.id
  await db.query(
    "insert into public.engagements(dossier_id,nom,revenu_net_mensuel_cents) values ($1,'Garant A',360000)",
    [dossier],
  )
  jti = (
    await db.query<{ jti: string }>("select * from public.emettre_jeton($1,'garant','7 days')", [
      dossier,
    ])
  ).rows[0]!.jti
})
afterEach(async () => {
  await db.close()
})
test('le contexte JSON reel ouvre seulement le dossier autorise', async () => {
  await porteur()
  expect((await db.query('select nom from public.engagements')).rows).toEqual([{ nom: 'Garant A' }])
})
test('un jeton remplace ne lit plus engagement, pieces ni cle', async () => {
  await db.query("select * from public.emettre_jeton($1,'garant','7 days')", [dossier])
  await porteur()
  for (const table of ['dossiers', 'engagements', 'pieces', 'cles_dossier'])
    expect((await db.query(`select * from public.${table}`)).rows).toEqual([])
})
test('le changement de personne ne reutilise pas un engagement existant', async () => {
  await expect(
    db.query("update public.dossiers set email_garant='nouveau@audit.invalid' where id=$1", [
      dossier,
    ]),
  ).rejects.toThrow()
})
test('le loyer ne peut plus sonder un revenu deja depose', async () => {
  await expect(
    db.query('update public.dossiers set loyer_cents=120001 where id=$1', [dossier]),
  ).rejects.toThrow()
})
test('une agence suspendue perd la lecture', async () => {
  await db.query("update public.agences set statut='suspendue' where id=$1", [agence])
  await collaborateur()
  expect((await db.query('select nom from public.engagements')).rows).toEqual([])
})
test('un membre retire ne se rattache pas automatiquement', async () => {
  await db.query('delete from public.membres_agence where utilisateur_id=$1', [membre])
  await collaborateur()
  await expect(db.query('select public.rejoindre_ou_creer_agence()')).rejects.toThrow()
})
test('la transmission interdit de reecrire le revenu', async () => {
  await db.query("update public.dossiers set statut='transmis' where id=$1", [dossier])
  await expect(
    db.query('update public.engagements set revenu_net_mensuel_cents=100 where dossier_id=$1', [
      dossier,
    ]),
  ).rejects.toThrow()
})
test('un collaborateur ne produit pas une signature par UPDATE', async () => {
  await collaborateur()
  await expect(db.query("update public.dossiers set statut='signe'")).rejects.toThrow()
})

test('une session agence sans second facteur ne lit aucune donnee', async () => {
  await collaborateur()
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal1' }),
  ])
  expect((await db.query('select * from public.engagements')).rows).toEqual([])
})
