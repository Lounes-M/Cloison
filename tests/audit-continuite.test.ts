import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire } from './base'
let db: PGlite
let id: string
beforeEach(async () => {
  db = await baseDEssai()
  id = (
    await db.query<{ id: string }>(
      "insert into public.dossiers(email_locataire,reference) values ('locataire@audit.invalid','AUDIT1234567') returning id",
    )
  ).rows[0]!.id
})
afterEach(async () => {
  await db.close()
})
test('la recuperation exige adresse et reference puis revoque le precedent', async () => {
  await devenir(db, 'serveur')
  expect(
    (
      await db.query(
        "select * from public.retrouver_lien_locataire('autre@audit.invalid','AUDIT1234567')",
      )
    ).rows,
  ).toEqual([])
  const premier = (
    await db.query<{ jti: string }>(
      "select * from public.retrouver_lien_locataire('locataire@audit.invalid','AUDIT1234567')",
    )
  ).rows[0]!.jti
  await db.query(
    "select * from public.retrouver_lien_locataire('locataire@audit.invalid','AUDIT1234567')",
  )
  expect(
    (
      await db.query<{ actif: boolean }>("select public.jeton_est_actif($1,'locataire',$2) actif", [
        id,
        premier,
      ])
    ).rows[0]!.actif,
  ).toBe(false)
})
test('le rattachement refuse une agence non verifiee et un garant', async () => {
  await db.query("insert into public.agences(nom,domaine) values ('Agence audit','audit.invalid')")
  await devenirPorteur(db, id, 'locataire')
  await expect(db.query("select public.rattacher_mon_dossier('audit.invalid')")).rejects.toThrow(
    'verifiee',
  )
  await redevenirProprietaire(db)
  await db.query("update public.agences set siren='123456789',carte_pro='CPI audit'")
  await db.query("update public.agences set statut='verifiee',verifiee_le=now()")
  await devenirPorteur(db, id, 'garant')
  await expect(db.query("select public.rattacher_mon_dossier('audit.invalid')")).rejects.toThrow(
    'refuse',
  )
  await devenirPorteur(db, id, 'locataire')
  expect((await db.query("select public.rattacher_mon_dossier('audit.invalid') nom")).rows).toEqual(
    [{ nom: 'Agence audit' }],
  )
  await expect(db.query("select public.rattacher_mon_dossier('audit.invalid')")).rejects.toThrow(
    'indisponible',
  )
})
test('le paiement ouvre trois mois sans attendre une piece', async () => {
  await devenir(db, 'serveur')
  await db.query("select public.marquer_dossier_paye($1,'cs_audit_1234')", [id])
  await redevenirProprietaire(db)
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select expire_le >= paye_le + interval '3 months' ok from public.dossiers",
      )
    ).rows[0]!.ok,
  ).toBe(true)
})
