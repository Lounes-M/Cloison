import { afterAll, beforeAll, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenirPorteur, redevenirProprietaire, refus } from './base'

let db: PGlite
let dossier: string
const mention = 'Mention fictive de test, volontairement incomplete et non contractuelle.'
beforeAll(async () => {
  db = await baseDEssai()
  const { rows } = await db.query<{ id: string }>(
    "insert into public.dossiers(email_locataire) values ('conditions@example.invalid') returning id",
  )
  dossier = rows[0]!.id
  await db.query(
    'insert into public.engagements(dossier_id, montant_max_cents) values ($1,1200000)',
    [dossier],
  )
  await devenirPorteur(db, dossier, 'garant')
})
afterAll(async () => {
  if (db) await db.close()
})

test.each([
  ['montant_max_cents', '1300000'],
  ['couvre', "'loyer'"],
  ['jusqu_au', "'2030-12-31'"],
  ['solidaire', 'false'],
])('changer %s invalide la mention precedente et sa date', async (colonne, valeur) => {
  await db.query(
    'update public.engagements set mention=$1, mention_saisie_le=now() where dossier_id=$2',
    [mention, dossier],
  )
  await db.query(`update public.engagements set ${colonne}=${valeur} where dossier_id=$1`, [
    dossier,
  ])
  const { rows } = await db.query(
    'select mention, mention_saisie_le from public.engagements where dossier_id=$1',
    [dossier],
  )
  expect(rows[0]).toEqual({ mention: null, mention_saisie_le: null })
})

test('un revenu seul et une sauvegarde identique conservent la mention et sa version', async () => {
  await db.query(
    'update public.engagements set mention=$1, mention_saisie_le=now() where dossier_id=$2',
    [mention, dossier],
  )
  const avant = await db.query(
    'select mention, mention_saisie_le, version_conditions from public.engagements where dossier_id=$1',
    [dossier],
  )
  await db.query(
    'update public.engagements set revenu_net_mensuel_cents=320000, couvre=couvre where dossier_id=$1',
    [dossier],
  )
  const apres = await db.query(
    'select mention, mention_saisie_le, version_conditions from public.engagements where dossier_id=$1',
    [dossier],
  )
  expect(apres.rows).toEqual(avant.rows)
})

test('une ecriture avec une ancienne version ne touche aucune ligne', async () => {
  const { rows } = await db.query<{ version_conditions: number }>(
    'select version_conditions from public.engagements where dossier_id=$1',
    [dossier],
  )
  const version = rows[0]!.version_conditions
  await db.query('update public.engagements set montant_max_cents=1400000 where dossier_id=$1', [
    dossier,
  ])
  const ancien = await db.query(
    'update public.engagements set mention=$1, mention_saisie_le=now() where dossier_id=$2 and version_conditions=$3 returning dossier_id',
    [mention, dossier, version],
  )
  expect(ancien.rows).toHaveLength(0)
  const actuel = await db.query(
    'select version_conditions, mention from public.engagements where dossier_id=$1',
    [dossier],
  )
  expect(Number(actuel.rows[0]!.version_conditions)).toBe(Number(version) + 1)
  expect(actuel.rows[0]!.mention).toBeNull()
})

test('le garant ne peut pas choisir la version par UPDATE', async () => {
  expect(await refus(db, 'update public.engagements set version_conditions=1')).toContain(
    'permission denied',
  )
})

test('une version fournie lors de INSERT ne remplace pas la version initiale', async () => {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ id: string }>(
    "insert into public.dossiers(email_locataire) values ('insertion@example.invalid') returning id",
  )
  await devenirPorteur(db, rows[0]!.id, 'garant')
  const insertion = await db.query(
    'insert into public.engagements(dossier_id,version_conditions) values ($1,999) returning version_conditions',
    [rows[0]!.id],
  )
  expect(Number(insertion.rows[0]!.version_conditions)).toBe(1)
})
