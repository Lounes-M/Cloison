import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, beforeEach, afterEach, expect, test } from 'vitest'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite
const dossier = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const reference = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const evenement = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
let demande: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  await db.query(
    "insert into dossiers(id,email_locataire,statut) values ($1,'fictif@example.invalid','transmis')",
    [dossier],
  )
  await devenir(db, 'serveur')
  demande = (await preparer()).id
})
afterEach(async () => {
  await db.exec('rollback')
})
async function preparer(empreinte = 'a'.repeat(64)) {
  return (
    await db.query<{ r: { id: string; nouvelle: boolean } }>(
      "select preparer_demande_signature($1,'sandbox',$2) r",
      [dossier, empreinte],
    )
  ).rows[0]!.r
}
async function lier(mode = 'sandbox') {
  return (
    await db.query<{ r: boolean }>('select rattacher_demande_signature($1,$2,$3) r', [
      demande,
      reference,
      mode,
    ])
  ).rows[0]!.r
}
async function notifier(statut = 'done', id = evenement, mode = 'sandbox') {
  return (
    await db.query<{ r: { enregistre: boolean; anomalie: boolean } }>(
      "select enregistrer_evenement_signature($1,$2,$3,$4,'2026-01-01'::timestamptz) r",
      [mode, id, reference, statut],
    )
  ).rows[0]!.r
}
type Bail = { id: string; reference_fournisseur: string; revision: number; bail: string }
async function reserver() {
  return (await db.query<Bail>("select * from reserver_signatures_a_rapprocher('sandbox')")).rows
}
async function confirmer(b: Bail, statut = 'done', externe = demande) {
  return (
    await db.query<{ r: boolean }>(
      "select confirmer_rapprochement_signature($1,'sandbox',$2,$3,$4,$5,$6) r",
      [demande, b.bail, b.revision, reference, externe, statut],
    )
  ).rows[0]!.r
}
test('la preparation est idempotente et interdit un autre acte non resolu', async () => {
  expect(await preparer()).toEqual({ id: demande, nouvelle: false })
  expect(await preparer('b'.repeat(64))).toBeNull()
  expect(await lier()).toBe(true)
  expect(await lier()).toBe(true)
  expect(await lier('production')).toBe(false)
})
test('un double evenement est durable sans doubler les travaux ni signer le dossier', async () => {
  await lier()
  expect(await notifier()).toEqual({ enregistre: true, anomalie: false })
  const bail = (await reserver())[0]!
  expect(await notifier()).toEqual({ enregistre: true, anomalie: false })
  expect(await confirmer(bail)).toBe(true)
  await redevenirProprietaire(db)
  expect((await db.query('select * from evenements_signature')).rows).toHaveLength(1)
  expect((await db.query('select statut from dossiers')).rows).toEqual([{ statut: 'transmis' }])
  expect((await db.query('select * from factures_actes')).rows).toHaveLength(0)
})
test('les evenements inconnus sont conserves avant rattachement', async () => {
  await notifier()
  expect(await reserver()).toEqual([])
  await lier()
  expect(await reserver()).toHaveLength(1)
})
test('un evenement modifie est une anomalie persistante', async () => {
  await lier()
  await notifier()
  expect((await notifier('expired')).anomalie).toBe(true)
  expect((await notifier()).anomalie).toBe(true)
  expect(await reserver()).toEqual([])
})
test('un conflit avant rattachement bloque aussi la demande', async () => {
  await notifier()
  await notifier('expired')
  expect(await lier()).toBe(false)
})
test('un evenement production ne reveille pas une demande sandbox', async () => {
  await lier()
  const bail = (await reserver())[0]!
  await notifier('done', evenement, 'production')
  expect(await confirmer(bail, 'ongoing')).toBe(true)
  expect(await reserver()).toEqual([])
})
test('un evenement recu pendant la lecture invalide le snapshot', async () => {
  await lier()
  const bail = (await reserver())[0]!
  expect(await reserver()).toEqual([])
  await notifier()
  expect(await confirmer(bail)).toBe(false)
  expect(await reserver()).toHaveLength(1)
})
test('une autre reference externe ne signe rien et bloque le rapprochement', async () => {
  await lier()
  expect(await confirmer((await reserver())[0]!, 'done', reference)).toBe(false)
  expect(await reserver()).toEqual([])
})
test('un ancien bail ne peut pas confirmer apres une reprise', async () => {
  await lier()
  const ancien = (await reserver())[0]!
  await redevenirProprietaire(db)
  await db.exec("update demandes_signature set bail_jusqu_au=clock_timestamp()-interval '1 second'")
  await devenir(db, 'serveur')
  const nouveau = (await reserver())[0]!
  expect(nouveau.bail).not.toBe(ancien.bail)
  expect(await confirmer(ancien)).toBe(false)
  expect(await confirmer(nouveau)).toBe(true)
})
test('un etat termine ne regresse pas silencieusement', async () => {
  await lier()
  expect(await confirmer((await reserver())[0]!)).toBe(true)
  await notifier('ongoing')
  expect(await confirmer((await reserver())[0]!, 'ongoing')).toBe(false)
  await redevenirProprietaire(db)
  expect((await db.query('select etat,anomalie from demandes_signature')).rows).toEqual([
    { etat: 'done', anomalie: true },
  ])
})
test('la purge ne recree jamais un dossier a partir du fournisseur', async () => {
  await lier()
  const bail = (await reserver())[0]!
  await redevenirProprietaire(db)
  await db.query('delete from dossiers where id=$1', [dossier])
  await devenir(db, 'serveur')
  await notifier()
  expect(await confirmer(bail)).toBe(false)
  expect(await reserver()).toEqual([])
})
test('une panne applique un delai sans perdre le travail', async () => {
  await lier()
  const bail = (await reserver())[0]!
  expect(
    (
      await db.query<{ r: boolean }>("select echec_rapprochement_signature($1,'sandbox',$2) r", [
        demande,
        bail.bail,
      ])
    ).rows[0]!.r,
  ).toBe(true)
  expect(await reserver()).toEqual([])
  expect(await confirmer(bail)).toBe(false)
})
test('les roles utilisateurs ne disposent d aucun acces au registre', async () => {
  await redevenirProprietaire(db)
  for (const role of [
    'anon',
    'authenticated',
    'porteur_lien',
    'depot_piece',
    'serveur',
    'service_role',
  ]) {
    for (const table of ['demandes_signature', 'evenements_signature']) {
      expect(
        (
          await db.query<{ r: boolean }>(
            "select has_table_privilege($1,$2,'select,insert,update,delete') r",
            [role, table],
          )
        ).rows[0]!.r,
      ).toBe(false)
    }
    if (role !== 'serveur') {
      for (const signature of [
        'preparer_demande_signature(uuid,text,text)',
        'rattacher_demande_signature(uuid,uuid,text)',
        'enregistrer_evenement_signature(text,uuid,uuid,text,timestamptz)',
        'reserver_signatures_a_rapprocher(text)',
        'confirmer_rapprochement_signature(uuid,text,uuid,bigint,uuid,uuid,text)',
        'echec_rapprochement_signature(uuid,text,uuid)',
        'signatures_a_examiner(text)',
      ]) {
        expect(
          (
            await db.query<{ r: boolean }>("select has_function_privilege($1,$2,'execute') r", [
              role,
              signature,
            ])
          ).rows[0]!.r,
        ).toBe(false)
      }
    }
  }
})

test('la supervision distingue le delai de rattachement des anomalies persistantes', async () => {
  const alertes = async () =>
    (await db.query<{ r: number }>("select signatures_a_examiner('sandbox') r")).rows[0]!.r
  expect(await alertes()).toBe(0)
  await notifier()
  expect(await alertes()).toBe(0)
  await redevenirProprietaire(db)
  await db.exec(
    "update demandes_signature set cree_le=clock_timestamp()-interval '2 hours'; update evenements_signature set recu_le=clock_timestamp()-interval '2 hours'",
  )
  await devenir(db, 'serveur')
  expect(await alertes()).toBe(2)
  await lier()
  expect(await alertes()).toBe(0)
  await notifier('expired')
  expect(await alertes()).toBe(2)
})
