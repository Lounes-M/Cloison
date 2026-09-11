import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite, admin: string, membre: string, dossier: string, agence: string
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
    await db.query<{ a: string; m: string; d: string; g: string }>(
      "select current_setting('cloison.responsable_admin') a,current_setting('cloison.responsable_premier') m,current_setting('cloison.responsable_dossier') d,current_setting('cloison.responsable_agence') g",
    )
  ).rows[0]!
  admin = r.a
  membre = r.m
  dossier = r.d
  agence = r.g
  await db.query("update agences set siren='123456789',carte_pro='TEST' where id=$1", [agence])
  await db.query("update agences set statut='verifiee',verifiee_le=now() where id=$1", [agence])
  await db.query("update dossiers set statut='complet' where id=$1", [dossier])
  await devenir(db, 'authenticated', membre)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function regler(mode: string | null, revision: string | null = null) {
  return (
    await db.query<{ r: string | null }>('select regler_notifications($1,$2) r', [mode, revision])
  ).rows[0]!.r
}
async function lire() {
  return (await db.query('select * from mes_preferences_notifications()')).rows
}
async function contacts() {
  await devenir(db, 'serveur')
  return (
    await db.query<{ contacts: string[]; dossier: { email_locataire: string } }>(
      'select * from notifications_a_livrer($1)',
      [dossier],
    )
  ).rows[0]!
}
test('le choix par defaut reste tous et une revision ancienne ne remplace rien', async () => {
  expect(await lire()).toEqual([{ mode: 'tous', revision: null }])
  const r = await regler('aucun')
  expect(r).toBeTruthy()
  expect(await regler('mes')).toBeNull()
  expect(await lire()).toEqual([{ mode: 'aucun', revision: r }])
  const suivant = await regler('mes', r)
  expect(suivant).toBeTruthy()
  expect(suivant).not.toBe(r)
})
test.each([null, 'inconnu'])('refuse le mode %s', async (mode) => {
  expect(await regler(mode)).toBeNull()
})
test('refuse les preferences sans MFA', async () => {
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: membre, aal: 'aal1' }),
  ])
  expect(await lire()).toEqual([])
  expect(await regler('aucun')).toBeNull()
  expect((await db.query('select * from preferences_notifications')).rows).toEqual([])
})
test('les preferences restent personnelles meme pour un administrateur', async () => {
  await regler('aucun')
  await devenir(db, 'authenticated', admin)
  expect(await lire()).toEqual([{ mode: 'tous', revision: null }])
  expect((await db.query('select * from preferences_notifications')).rows).toEqual([])
  await regler('mes')
  await devenir(db, 'authenticated', membre)
  expect(await lire()).toEqual([expect.objectContaining({ mode: 'aucun' })])
})
test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne gere pas les preferences',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await db.exec('savepoint droits')
    await expect(lire()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to droits')
    await expect(regler('aucun')).rejects.toThrow(/permission denied/)
    await db.exec('rollback to droits')
    await expect(db.query('select * from preferences_notifications')).rejects.toThrow(
      /permission denied/,
    )
  },
)
test.each(['insert', 'update', 'delete'])('refuse %s direct', async (op) => {
  await regler('tous')
  const sql =
    op === 'insert'
      ? `insert into preferences_notifications(utilisateur_id,mode) values('${admin}','aucun')`
      : op === 'update'
        ? "update preferences_notifications set mode='aucun'"
        : 'delete from preferences_notifications'
  await expect(db.query(sql)).rejects.toThrow(/permission denied/)
})
test('le silence retire seulement le destinataire concerne, pas le locataire', async () => {
  await regler('aucun')
  const n = await contacts()
  expect(n.contacts).toHaveLength(2)
  expect(n.contacts.some((e) => e.startsWith(membre))).toBe(false)
  expect(n.contacts.some((e) => e.startsWith(admin))).toBe(true)
  expect(n.dossier.email_locataire).toBe('responsable@example.invalid')
})
test('mes dossiers exige une affectation actuelle au bon membre', async () => {
  await regler('mes')
  expect((await contacts()).contacts.some((e) => e.startsWith(membre))).toBe(false)
  await devenir(db, 'authenticated', admin)
  const r = (await db.query<{ r: string }>('select affecter_dossier($1,$2) r', [dossier, membre]))
    .rows[0]!.r
  expect((await contacts()).contacts.some((e) => e.startsWith(membre))).toBe(true)
  await devenir(db, 'authenticated', admin)
  await db.query('select affecter_dossier($1,$2,$3)', [dossier, admin, r])
  expect((await contacts()).contacts.some((e) => e.startsWith(membre))).toBe(false)
})
test('un changement de preference ne recree pas une notification acquittee', async () => {
  await devenir(db, 'serveur')
  await db.query('select acquitter_notification(id) from notifications_a_livrer($1)', [dossier])
  await devenir(db, 'authenticated', membre)
  await regler('mes')
  await devenir(db, 'serveur')
  expect((await db.query('select * from notifications_a_livrer($1)', [dossier])).rows).toEqual([])
})
test('une exclusion efface le choix avant toute readmission', async () => {
  await regler('aucun')
  await redevenirProprietaire(db)
  await db.query('delete from membres_agence where utilisateur_id=$1', [membre])
  expect((await db.query('select * from preferences_notifications')).rows).toEqual([])
  await devenir(db, 'authenticated', membre)
  expect(await lire()).toEqual([])
  expect(await regler('mes')).toBeNull()
})
