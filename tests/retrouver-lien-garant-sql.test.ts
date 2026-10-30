import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { baseDEssai, devenir, redevenirProprietaire } from './base'

let db: PGlite
let id: string
const retrouver = (courriel: string, reference: string) =>
  db.query<{ dossier_id: string }>('select dossier_id from public.retrouver_lien_garant($1,$2)', [
    courriel,
    reference,
  ])

const payer = () => db.query("select public.marquer_dossier_paye($1,'cs_garant_1234')", [id])

beforeEach(async () => {
  db = await baseDEssai()
  id = (
    await db.query<{ id: string }>(
      `insert into public.dossiers(email_locataire,email_garant,reference)
       values ('locataire@garant.invalid','garant@garant.invalid','GARANT123456') returning id`,
    )
  ).rows[0]!.id
})
afterEach(async () => {
  await db.close()
})

test('un dossier de particulier non regle n a pas encore de lien garant a retrouver', async () => {
  await devenir(db, 'serveur')
  expect((await retrouver('garant@garant.invalid', 'GARANT123456')).rows).toEqual([])
})

test('le garant retrouve son lien avec son adresse et la reference, et rien d autre', async () => {
  await devenir(db, 'serveur')
  await payer()
  expect((await retrouver('locataire@garant.invalid', 'GARANT123456')).rows).toEqual([])
  expect((await retrouver('garant@garant.invalid', 'AUTRE1234567')).rows).toEqual([])
  expect((await retrouver(' Garant@Garant.invalid ', 'GARANT123456')).rows).toEqual([
    { dossier_id: id },
  ])
  await redevenirProprietaire(db)
  const premier = (
    await db.query<{ jti: string }>(
      "select jti from public.jetons_actifs where dossier_id=$1 and partie='garant'",
      [id],
    )
  ).rows[0]!.jti
  expect(
    (
      await db.query<{ partie: string }>('select partie from public.livraisons_liens where id=$1', [
        premier,
      ])
    ).rows,
  ).toEqual([{ partie: 'garant' }])

  await devenir(db, 'serveur')
  await retrouver('garant@garant.invalid', 'GARANT123456')
  expect(
    (
      await db.query<{ actif: boolean }>("select public.jeton_est_actif($1,'garant',$2) actif", [
        id,
        premier,
      ])
    ).rows[0]!.actif,
  ).toBe(false)
})

test('un dossier echu ne rend plus de lien', async () => {
  await devenir(db, 'serveur')
  await payer()
  await redevenirProprietaire(db)
  await db.query(
    "update public.dossiers set expire_le=cree_le+interval '1 millisecond' where id=$1",
    [id],
  )
  await devenir(db, 'serveur')
  expect((await retrouver('garant@garant.invalid', 'GARANT123456')).rows).toEqual([])
})

test('seul le serveur peut demander un lien de garant', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien']) {
    const { rows } = await db.query<{ autorise: boolean }>(
      "select has_function_privilege($1,'public.retrouver_lien_garant(text,text)','execute') autorise",
      [role],
    )
    expect(rows[0]!.autorise, role).toBe(false)
  }
})
