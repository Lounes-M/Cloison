import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'

/**
 * Relances du locataire (0089).
 *
 * Ce qui compte : le locataire est relance pour ce que le dossier attend de
 * lui (reglement, garant, loyer), sans agence apres trois jours et avec agence
 * selon son reglage ; trois relances par motif, trois jours entre deux ; un
 * paiement, une designation ou un loyer annule ce qui est en file ; les
 * plafonds de la 0052 tiennent ; l'ancien contrat de lecture ignore la
 * nouvelle nature.
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
  // Un dossier ouvert par le locataire seul : ni agence, ni reglement, ni garant.
  await db.query(
    "insert into dossiers(id,email_locataire,loyer_cents) values($1,'Loc@Example.invalid',90000)",
    [dossier],
  )
  await vieillir(4)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function vieillir(jours: number, id = dossier) {
  await redevenirProprietaire(db)
  await db.query(
    `update dossiers set activite_rappel_le=now()-interval '${jours} days' where id=$1`,
    [id],
  )
}
async function programmer() {
  await devenir(db, 'serveur')
  const n = (await db.query<{ n: number }>('select programmer_rappels() n')).rows[0]!.n
  await redevenirProprietaire(db)
  return n
}
type Relance = { id: string; dossier_id: string; motif: string; email: string; reference: string }
async function preparer() {
  await devenir(db, 'serveur')
  const lignes = (await db.query<Relance>('select * from rappels_locataire_a_preparer()')).rows
  await redevenirProprietaire(db)
  return lignes
}
async function enfiler(id: string) {
  await devenir(db, 'serveur')
  const s = (
    await db.query<{ s: string }>("select mettre_rappel_en_file($1,'chiffre-fictif') s", [id])
  ).rows[0]!.s
  await redevenirProprietaire(db)
  return s
}
const payer = (id = dossier) =>
  db.query('update dossiers set paye_le=now(),paiement_ref=$2 where id=$1', [id, `ref-${id}`])
const designer = () =>
  db.query("update dossiers set email_garant='garant@example.invalid' where id=$1", [dossier])
const motifs = async () =>
  (
    await db.query<{ motif: string }>(
      "select motif from rappels_dossiers where dossier_id=$1 and nature='locataire' order by cree_le",
      [dossier],
    )
  ).rows.map((r) => r.motif)
/** Fait comme si les relances deja programmees dataient de quatre jours. */
const espacer = () => db.query("update rappels_dossiers set cree_le=now()-interval '4 days'")

async function agenceVerifiee() {
  await db.exec(
    readFileSync('supabase/essais/responsables.sql', 'utf8').split(
      'set local role authenticated;',
    )[0]!,
  )
  const r = (
    await db.query<{ a: string; d: string; g: string }>(
      "select current_setting('cloison.responsable_admin') a,current_setting('cloison.responsable_dossier') d,current_setting('cloison.responsable_agence') g",
    )
  ).rows[0]!
  await db.query("update agences set siren='123456789',carte_pro='TEST' where id=$1", [r.g])
  await db.query("update agences set statut='verifiee',verifiee_le=now() where id=$1", [r.g])
  return { admin: r.a, dossier: r.d, agence: r.g }
}
async function regler(admin: string, jours: number) {
  await devenir(db, 'authenticated', admin)
  const { rows } = await db.query<{ r: string | null }>('select regler_rappels($1,0,null) r', [
    jours,
  ])
  await redevenirProprietaire(db)
  expect(rows[0]!.r).toBeTruthy()
}

test('sans agence, le locataire est relance pour le reglement apres trois jours', async () => {
  await vieillir(2)
  expect(await programmer()).toBe(0)
  await vieillir(4)
  expect(await programmer()).toBe(1)
  expect(await programmer()).toBe(0)
  const [r] = await preparer()
  expect(r).toMatchObject({
    dossier_id: dossier,
    motif: 'paiement',
    email: 'Loc@Example.invalid',
  })
  expect(Object.keys(r!).sort()).toEqual(
    ['dossier_id', 'email', 'expiration', 'id', 'motif', 'reference'].sort(),
  )
  // Le registre ne garde qu'une empreinte de l'adresse, et aucun collaborateur.
  const { rows } = await db.query<{ empreinte_email: string; membre_id: null; agence_id: null }>(
    'select empreinte_email,membre_id,agence_id from rappels_dossiers where id=$1',
    [r!.id],
  )
  expect(rows[0]).toMatchObject({ membre_id: null, agence_id: null })
  expect(rows[0]!.empreinte_email).toMatch(/^[0-9a-f]{64}$/)
  expect(await enfiler(r!.id)).toBe('prepare')
  expect(await preparer()).toEqual([])
})

test('l ancien contrat de lecture ignore les relances du locataire', async () => {
  expect(await programmer()).toBe(1)
  await devenir(db, 'serveur')
  expect((await db.query('select * from rappels_a_preparer()')).rows).toEqual([])
})

test('le motif suit le parcours : reglement, garant, puis loyer', async () => {
  await db.query('update dossiers set loyer_cents=null where id=$1', [dossier])
  const motif = async () =>
    (await db.query<{ m: string | null }>('select motif_relance_locataire($1) m', [dossier]))
      .rows[0]!.m
  expect(await motif()).toBe('paiement')
  await payer()
  expect(await motif()).toBe('garant')
  await designer()
  expect(await motif()).toBe('loyer')
  await db.query('update dossiers set loyer_cents=90000 where id=$1', [dossier])
  expect(await motif()).toBeNull()
  await vieillir(30)
  expect(await programmer()).toBe(0)
})

test.each([
  ['un paiement', payer],
  [
    'un loyer modifie',
    () => db.query('update dossiers set loyer_cents=95000 where id=$1', [dossier]),
  ],
])('%s est une activite : il reporte la relance et annule celle en file', async (_nom, geste) => {
  expect(await programmer()).toBe(1)
  const [r] = await preparer()
  expect(await enfiler(r!.id)).toBe('prepare')
  await geste()
  const { rows } = await db.query<{ recent: boolean }>(
    "select activite_rappel_le>now()-interval '1 minute' recent from dossiers where id=$1",
    [dossier],
  )
  expect(rows[0]!.recent).toBe(true)
  expect(
    (await db.query<{ v: boolean }>('select rappel_encore_valide($1) v', [r!.id])).rows[0]!.v,
  ).toBe(false)
  // La prise de bail efface le contenu du courriel devenu obsolete.
  await devenir(db, 'serveur')
  expect((await db.query('select * from prendre_courriels($1)', [r!.id])).rows).toEqual([])
  await redevenirProprietaire(db)
  expect(
    (
      await db.query<{ contenu: string | null; annule: boolean }>(
        'select contenu,annule_le is not null annule from courriels_sortants where id=$1',
        [r!.id],
      )
    ).rows,
  ).toEqual([{ contenu: null, annule: true }])
  await espacer()
  expect(await programmer()).toBe(0)
})

test('un rappel dont le motif a change ne part pas, meme sans nouvelle activite', async () => {
  expect(await programmer()).toBe(1)
  const [r] = await preparer()
  // Le motif change sans passer par le declencheur d'activite.
  await db.exec('alter table dossiers disable trigger activite_rappel_dossier')
  await payer()
  await db.exec('alter table dossiers enable trigger activite_rappel_dossier')
  expect(await preparer()).toEqual([])
  expect(await enfiler(r!.id)).toBe('obsolete')
})

test('trois relances au plus par motif, espacees de trois jours', async () => {
  expect(await programmer()).toBe(1)
  // Moins de trois jours apres la precedente : rien.
  expect(await programmer()).toBe(0)
  await espacer()
  expect(await programmer()).toBe(1)
  await espacer()
  expect(await programmer()).toBe(1)
  await espacer()
  expect(await programmer()).toBe(0)
  expect(await motifs()).toEqual(['paiement', 'paiement', 'paiement'])
  // Une fois regle, le motif suivant a ses propres relances.
  await payer()
  await vieillir(4)
  expect(await programmer()).toBe(1)
  expect(await motifs()).toEqual(['paiement', 'paiement', 'paiement', 'garant'])
})

test('une relance d un motif retarde de trois jours celle du motif suivant', async () => {
  expect(await programmer()).toBe(1)
  await payer()
  await vieillir(4)
  expect(await programmer()).toBe(0)
  await espacer()
  expect(await programmer()).toBe(1)
  expect(await motifs()).toEqual(['paiement', 'garant'])
})

test.each([
  'demonstration',
  'expiration',
  'refuse',
  'transmis',
  'signe',
  'expire',
  'second-garant',
])('aucune relance du locataire pour %s', async (cas) => {
  if (cas === 'demonstration')
    await db.query('update dossiers set demonstration=true where id=$1', [dossier])
  else if (cas === 'expiration')
    await db.query(
      "update dossiers set cree_le=now()-interval '40 days',expire_le=now()-interval '1 second' where id=$1",
      [dossier],
    )
  else if (cas === 'second-garant') {
    const principal = randomUUID()
    await db.query(
      "insert into dossiers(id,email_locataire,email_garant,loyer_cents,paye_le,paiement_ref) values($1,'loc@example.invalid','premier@example.invalid',90000,now(),'ref-principal')",
      [principal],
    )
    await db.query('update dossiers set dossier_principal=$2 where id=$1', [dossier, principal])
  } else {
    await db.exec('alter table dossiers disable trigger user')
    await db.query('update dossiers set statut=$2 where id=$1', [dossier, cas])
    await db.exec('alter table dossiers enable trigger user')
  }
  await vieillir(10)
  expect(await programmer()).toBe(0)
  expect(await preparer()).toEqual([])
})

test('avec une agence, le reglage de relance de l agence decide', async () => {
  await payer()
  await designer()
  const a = await agenceVerifiee()
  await db.query('update dossiers set email_garant=null where id=$1', [a.dossier])
  // Desactive par defaut : rien ne part, meme apres un long silence.
  await vieillir(30, a.dossier)
  expect(await programmer()).toBe(0)
  await regler(a.admin, 7)
  await vieillir(5, a.dossier)
  expect(await programmer()).toBe(0)
  await vieillir(8, a.dossier)
  expect(await programmer()).toBe(1)
  const [r] = await preparer()
  expect(r).toMatchObject({ dossier_id: a.dossier, motif: 'garant' })
  const { rows } = await db.query<{ agence_id: string }>(
    'select agence_id from rappels_dossiers where id=$1',
    [r!.id],
  )
  expect(rows[0]!.agence_id).toBe(a.agence)
  // L'agence coupe ses relances : le rappel en attente ne vaut plus.
  await db.query('update reglages_rappels set relance_jours=0 where agence_id=$1', [a.agence])
  expect(await preparer()).toEqual([])
  expect(await enfiler(r!.id)).toBe('obsolete')
})

test('une agence non verifiee ne declenche aucune relance du locataire', async () => {
  await payer()
  await designer()
  const a = await agenceVerifiee()
  await regler(a.admin, 3)
  await db.query('update dossiers set email_garant=null where id=$1', [a.dossier])
  await vieillir(8, a.dossier)
  await db.query("update agences set statut='decouverte' where id=$1", [a.agence])
  expect(await programmer()).toBe(0)
})

test('les plafonds tiennent : 20 par passage et 50 par jour pour les dossiers sans agence', async () => {
  await db.query(
    "insert into dossiers(email_locataire,loyer_cents) select 'loc'||n||'@example.invalid',90000 from generate_series(1,59) n",
  )
  await db.query("update dossiers set activite_rappel_le=now()-interval '4 days'")
  expect(await programmer()).toBe(20)
  expect(await programmer()).toBe(20)
  expect(await programmer()).toBe(10)
  expect(await programmer()).toBe(0)
})

test.each(['anon', 'authenticated', 'porteur_lien', 'depot_piece', 'service_role'])(
  'le role %s ne lit ni les relances du locataire ni leur motif',
  async (role) => {
    await db.exec(`set local role ${role}`)
    for (const sql of [
      'select * from rappels_locataire_a_preparer()',
      'select motif_relance_locataire(gen_random_uuid())',
    ]) {
      await db.exec('savepoint droits')
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      await db.exec('rollback to droits')
    }
  },
)

test('le serveur ne lit pas le motif directement', async () => {
  await devenir(db, 'serveur')
  await expect(db.query('select motif_relance_locataire(gen_random_uuid())')).rejects.toThrow(
    /permission denied/,
  )
})
