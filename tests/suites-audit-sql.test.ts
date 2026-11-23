import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import {
  baseDEssai,
  devenir,
  devenirPorteur,
  redevenirProprietaire,
  refus as refusBrut,
} from './base'

/**
 * Suites de l'audit fonctionnel (0085).
 *
 * Ce qui compte : le locataire et le garant sont annoncés une seule fois par
 * échéance, sans dépendre d'une agence, et un rejeu de Docage ne grossit pas
 * le registre des signatures.
 */

let db: PGlite, dossier: string

beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  dossier = randomUUID()
  await db.query(
    "insert into dossiers(id,email_locataire,email_garant,statut,expire_le) values($1,'loc@example.invalid','garant@example.invalid','depot_en_cours',now()+interval '5 days')",
    [dossier],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function refus(sql: string) {
  await db.exec('savepoint refus')
  const message = await refusBrut(db, sql)
  await db.exec('rollback to savepoint refus')
  return message
}

type Annonce = {
  dossier_id: string
  reference: string
  email_locataire: string
  email_garant: string | null
  expiration: string
  secondaire: boolean
}
const annonces = async () =>
  (await db.query<Annonce>('select * from echeances_a_annoncer()')).rows.filter(
    (a) => a.dossier_id === dossier,
  )
const acquitter = async (expiration: string) =>
  (
    await db.query<{ r: boolean }>('select acquitter_alerte_echeance($1,$2) r', [
      dossier,
      expiration,
    ])
  ).rows[0]!.r

test('un dossier sans agence est annoncé à sept jours, une seule fois', async () => {
  await devenir(db, 'serveur')
  const [a] = await annonces()
  expect(a).toMatchObject({
    email_locataire: 'loc@example.invalid',
    email_garant: 'garant@example.invalid',
    secondaire: false,
  })
  expect(await acquitter(a!.expiration)).toBe(true)
  expect(await annonces()).toEqual([])
})

test('un dossier loin de son échéance, clos ou de démonstration ne l’est pas', async () => {
  await db.query("update dossiers set expire_le=now()+interval '8 days' where id=$1", [dossier])
  await devenir(db, 'serveur')
  expect(await annonces()).toEqual([])
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set expire_le=now()+interval '2 days',statut='refuse' where id=$1",
    [dossier],
  )
  await devenir(db, 'serveur')
  expect(await annonces()).toEqual([])
})

test('une échéance repoussée est annoncée à nouveau, à sa nouvelle date', async () => {
  await devenir(db, 'serveur')
  const [a] = await annonces()
  await redevenirProprietaire(db)
  await db.query("update dossiers set expire_le=now()+interval '6 days' where id=$1", [dossier])
  await devenir(db, 'serveur')
  // L'acquittement de l'ancienne date ne couvre pas la nouvelle.
  expect(await acquitter(a!.expiration)).toBe(false)
  const [b] = await annonces()
  expect(b!.expiration).not.toBe(a!.expiration)
  expect(await acquitter(b!.expiration)).toBe(true)
  expect(await annonces()).toEqual([])
})

test('le dossier d’un second garant ne réécrit pas au locataire', async () => {
  const second = randomUUID()
  await db.query(
    "insert into dossiers(id,email_locataire,email_garant,statut,expire_le,dossier_principal) values($1,'loc@example.invalid','second@example.invalid','ouvert',now()+interval '5 days',$2)",
    [second, dossier],
  )
  await devenir(db, 'serveur')
  const lignes = (await db.query<Annonce>('select * from echeances_a_annoncer()')).rows
  expect(lignes.find((a) => a.dossier_id === second)?.secondaire).toBe(true)
})

test('les annonces sont réservées au serveur', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien'] as const) {
    await devenir(db, role, randomUUID())
    await refus('select * from echeances_a_annoncer()')
    await refus('select * from alertes_echeance')
    await redevenirProprietaire(db)
  }
})

test('un rejeu Docage réveille la lecture sans ajouter d’événement', async () => {
  const reference = randomUUID()
  await db.query("update dossiers set statut='transmis' where id=$1", [dossier])
  await devenir(db, 'serveur')
  const demande = (
    await db.query<{ r: { id: string } }>("select preparer_demande_signature($1,'sandbox',$2) r", [
      dossier,
      'a'.repeat(64),
    ])
  ).rows[0]!.r.id
  await db.query("select rattacher_demande_signature($1,$2,'sandbox')", [demande, reference])
  const reveiller = async (statut: string) =>
    (
      await db.query<{ r: { enregistre: boolean; anomalie: boolean } }>(
        "select enregistrer_reveil_docage('sandbox',$1,$2) r",
        [reference, statut],
      )
    ).rows[0]!.r
  const etat = async () => {
    await redevenirProprietaire(db)
    const r = (
      await db.query<{ n: number; revision: string; anomalie: boolean }>(
        'select (select count(*)::int from evenements_signature where reference_fournisseur=$1) n, revision::text, anomalie from demandes_signature where id=$2',
        [reference, demande],
      )
    ).rows[0]!
    await devenir(db, 'serveur')
    return r
  }
  const avant = await etat()
  expect(await reveiller('ongoing')).toEqual({ enregistre: true, anomalie: false })
  expect(await reveiller('ongoing')).toEqual({ enregistre: true, anomalie: false })
  const apres = await etat()
  expect(apres.n).toBe(1)
  expect(apres.anomalie).toBe(false)
  expect(BigInt(apres.revision)).toBe(BigInt(avant.revision) + 2n)
  await reveiller('done')
  expect((await etat()).n).toBe(2)
  await refus(`select enregistrer_reveil_docage('sandbox','${reference}','inconnu')`)
})

/** Le lien du garant part-il ? Rejoué comme le serveur, sans garder l'émission. */
async function lienGarantPossible(id: string) {
  await devenir(db, 'serveur')
  await db.exec('savepoint emission')
  try {
    await db.query("select * from emettre_jeton($1,'garant','7 days')", [id])
    return true
  } catch {
    return false
  } finally {
    await db.exec('rollback to savepoint emission')
    await redevenirProprietaire(db)
  }
}

async function agenceVerifiee() {
  const id = randomUUID()
  await db.query(
    "insert into agences(id,nom,domaine,statut,verifiee_le,siren,carte_pro) values($1,'Invitante','invitante.invalid','verifiee',now(),'552100554','CPI 7501 2024 000 000 001')",
    [id],
  )
  return id
}

test('se rattacher seul à une agence ne dispense plus du paiement', async () => {
  await agenceVerifiee()
  expect(await lienGarantPossible(dossier)).toBe(false)
  await devenirPorteur(db, dossier, 'locataire')
  await db.query("select rattacher_mon_dossier('invitante.invalid')")
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ agence_id: string | null; seul: boolean; reference: string }>(
    'select agence_id, rattache_par_locataire seul, reference from dossiers where id=$1',
    [dossier],
  )
  expect(rows[0]!.agence_id).not.toBeNull()
  expect(rows[0]!.seul).toBe(true)
  expect(await lienGarantPossible(dossier)).toBe(false)
  // Le garant ne retrouve pas non plus un lien qui n'a jamais été acheté.
  await devenir(db, 'serveur')
  expect(
    (
      await db.query("select * from retrouver_lien_garant('garant@example.invalid',$1)", [
        rows[0]!.reference,
      ])
    ).rows,
  ).toEqual([])
  await redevenirProprietaire(db)
  // Une fois réglé, le lien part.
  await db.query("update dossiers set paye_le=now(),paiement_ref='cs_test_suites' where id=$1", [
    dossier,
  ])
  expect(await lienGarantPossible(dossier)).toBe(true)
})

test('un dossier ouvert par l’agence reste gratuit, second garant compris', async () => {
  const agence = await agenceVerifiee()
  const invite = randomUUID()
  const second = randomUUID()
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,email_garant) values($1,$2,'invite@example.invalid','g1@example.invalid')",
    [invite, agence],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,email_garant,dossier_principal) values($1,$2,'invite@example.invalid','g2@example.invalid',$3)",
    [second, agence, invite],
  )
  expect(await lienGarantPossible(invite)).toBe(true)
  expect(await lienGarantPossible(second)).toBe(true)
  // Le dossier du second garant suit le principal : rattaché seul et impayé, il attend aussi.
  await db.query('update dossiers set rattache_par_locataire=true where id=$1', [invite])
  expect(await lienGarantPossible(second)).toBe(false)
})

test('entrer par le lien de candidature d’un logement rend la dispense', async () => {
  const agence = await agenceVerifiee()
  const logement = randomUUID()
  await db.query('update dossiers set agence_id=$2, rattache_par_locataire=true where id=$1', [
    dossier,
    agence,
  ])
  await db.query(
    "insert into logements(id,agence_id,libelle,loyer_cents) values($1,$2,'T2 fictif',80000)",
    [logement, agence],
  )
  expect(await lienGarantPossible(dossier)).toBe(false)
  await db.query('update dossiers set logement_id=$2 where id=$1', [dossier, logement])
  expect(await lienGarantPossible(dossier)).toBe(true)
})
