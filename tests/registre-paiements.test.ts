import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire, refus } from './base'
let db: PGlite
const dossier = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

test('le tarif public ne traverse ni le dossier ni la partie du porteur', async () => {
  await db.query('insert into sessions_paiement(dossier_id) values ($1)', [dossier])
  await devenirPorteur(db, dossier, 'locataire')
  expect((await db.query('select * from mon_tarif_paiement()')).rows).toEqual([
    { montant_cents: 900, devise: 'eur', tarif_version: 'locataire-2026-09-04' },
  ])
  await devenirPorteur(db, dossier, 'garant')
  expect((await db.query('select * from mon_tarif_paiement()')).rows).toEqual([])
  await redevenirProprietaire(db)
  const autre = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  await db.query("insert into dossiers(id,email_locataire) values ($1,'autre@example.invalid')", [
    autre,
  ])
  await devenirPorteur(db, autre, 'locataire')
  expect((await db.query('select * from mon_tarif_paiement()')).rows).toEqual([])
  await redevenirProprietaire(db)
  for (const role of ['anon', 'authenticated', 'serveur', 'depot_piece']) {
    expect(
      (
        await db.query<{ autorise: boolean }>(
          "select has_function_privilege($1,'public.mon_tarif_paiement()','execute') as autorise",
          [role],
        )
      ).rows[0]!.autorise,
    ).toBe(false)
  }
})
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec('begin')
  await db.query("insert into dossiers(id,email_locataire) values ($1,'fictif@example.invalid')", [
    dossier,
  ])
  await devenir(db, 'serveur')
})
afterEach(async () => {
  await db.exec('rollback')
})
async function payer(
  event = 'evt_fictif',
  session = 'cs_fictif',
  montant = 900,
  version = 'locataire-2026-09-04',
) {
  return (
    await db.query<{ resultat: { marque: boolean; anomalie: boolean } }>(
      "select enregistrer_paiement_locataire($1,$2,'pi_fictif',$3,$4,'eur',$5,'2026-01-01'::timestamptz) as resultat",
      [event, session, dossier, montant, version],
    )
  ).rows[0]!.resultat
}
test('le registre est inaccessible aux roles utilisateurs', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien'] as const) {
    await devenir(db, role)
    await db.exec('savepoint refus_registre')
    expect(await refus(db, 'select * from registre_paiements')).toContain('permission denied')
    await db.exec('rollback to savepoint refus_registre')
    expect(await refus(db, 'select * from evenements_paiements')).toContain('permission denied')
    await db.exec('rollback to savepoint refus_registre')
  }
})
test('un rejeu identique ne duplique ni paiement ni evenement', async () => {
  expect(await payer()).toEqual({ marque: true, anomalie: false })
  expect(await payer()).toEqual({ marque: true, anomalie: false })
  await redevenirProprietaire(db)
  expect((await db.query('select * from registre_paiements')).rows).toHaveLength(1)
  expect((await db.query('select * from evenements_paiements')).rows).toHaveLength(1)
})
test('une autre reference et un montant inattendu sont conserves en anomalie', async () => {
  await payer()
  expect((await payer('evt_autre', 'cs_autre')).anomalie).toBe(true)
  expect((await payer('evt_montant', 'cs_montant', 901)).anomalie).toBe(true)
  await redevenirProprietaire(db)
  expect(
    (
      await db.query<{ paiement_ref: string | null }>(
        'select paiement_ref from dossiers where id=$1',
        [dossier],
      )
    ).rows[0],
  ).toEqual({ paiement_ref: 'cs_fictif' })
})
test('la purge ne detruit pas le registre et le rejeu ne recree pas le dossier', async () => {
  await payer()
  await redevenirProprietaire(db)
  await db.query('delete from dossiers where id=$1', [dossier])
  await devenir(db, 'serveur')
  expect((await payer()).marque).toBe(true)
  await redevenirProprietaire(db)
  expect((await db.query('select * from dossiers where id=$1', [dossier])).rows).toHaveLength(0)
  expect((await db.query('select dossier_id from registre_paiements')).rows[0]).toEqual({
    dossier_id: null,
  })
})
test('un ancien tarif reste reconnu apres creation d une nouvelle version', async () => {
  await redevenirProprietaire(db)
  await db.exec(
    "insert into tarifs_paiement(version,montant_cents,devise) values ('locataire-futur',1200,'eur')",
  )
  await devenir(db, 'serveur')
  expect((await payer()).marque).toBe(true)
})

test('un remboursement arrive avant le paiement puis rejoue ne double pas son total', async () => {
  const suivi = (event: string, montant: number) =>
    db.query(
      "select enregistrer_suivi_paiement($1,'pi_fictif','ch_fictif','remboursement',$2,'eur','rembourse','2026-01-01')",
      [event, montant],
    )
  await suivi('evt_refund', 500)
  await payer()
  await suivi('evt_refund', 500)
  await suivi('evt_refund_ancien', 200)
  const etat = (
    await db.query<{ etat: { rembourse_cents: number; remboursements: number } }>(
      'select etat_paiements() as etat',
    )
  ).rows[0]!.etat
  expect(etat.rembourse_cents).toBe(500)
  expect(etat.remboursements).toBe(1)
})
test('un litige clos ne se rouvre pas lors d un evenement ancien', async () => {
  await payer()
  for (const [event, etat, date] of [
    ['evt_ferme', 'won', '2026-02-01'],
    ['evt_ouvert', 'needs_response', '2026-01-01'],
  ]) {
    await db.query(
      "select enregistrer_suivi_paiement($1,'pi_fictif','dp_fictif','litige',900,'eur',$2,$3::timestamptz)",
      [event, etat, date],
    )
  }
  expect(
    (await db.query<{ etat: { litiges_ouverts: number } }>('select etat_paiements() as etat'))
      .rows[0]!.etat.litiges_ouverts,
  ).toBe(0)
})

test('la lecture fournisseur retrouve un paiement perdu sans inventer un evenement Stripe', async () => {
  const rapprocher = () =>
    db.query(
      "select rapprocher_paiement('cs_retrouve','pi_retrouve',$1,900,'eur','locataire-2026-09-04',true)",
      [dossier],
    )
  await rapprocher()
  await rapprocher()
  await redevenirProprietaire(db)
  expect(
    (
      await db.query<{ paiement_ref: string | null }>(
        'select paiement_ref from dossiers where id=$1',
        [dossier],
      )
    ).rows[0]!.paiement_ref,
  ).toBe('cs_retrouve')
  expect((await db.query('select * from rapprochements_paiements')).rows).toHaveLength(1)
  expect((await db.query('select * from evenements_paiements')).rows).toHaveLength(0)
})
test('un fournisseur non paye ne credite pas le dossier puis une confirmation peut le debloquer', async () => {
  await db.query(
    "select rapprocher_paiement('cs_attente','pi_attente',$1,900,'eur','locataire-2026-09-04',false)",
    [dossier],
  )
  await redevenirProprietaire(db)
  expect(
    (
      await db.query<{ paye_le: string | null }>('select paye_le from dossiers where id=$1', [
        dossier,
      ])
    ).rows[0]!.paye_le,
  ).toBeNull()
  await devenir(db, 'serveur')
  await db.query(
    "select rapprocher_paiement('cs_attente','pi_attente',$1,900,'eur','locataire-2026-09-04',true)",
    [dossier],
  )
  await redevenirProprietaire(db)
  expect(
    (
      await db.query<{ paiement_ref: string | null }>(
        'select paiement_ref from dossiers where id=$1',
        [dossier],
      )
    ).rows[0]!.paiement_ref,
  ).toBe('cs_attente')
})

test('le prix reserve est immuable et une reservation de rapprochement ne se double pas', async () => {
  await db.query('insert into sessions_paiement(dossier_id) values ($1)', [dossier])
  await redevenirProprietaire(db)
  await db.exec(
    "insert into tarifs_paiement(version,montant_cents,devise) values ('nouveau',1200,'eur')",
  )
  await devenir(db, 'serveur')
  await db.exec('savepoint refus_prix')
  expect(
    await refus(db, "update sessions_paiement set tarif_version='nouveau',montant_cents=1200"),
  ).toContain('immuable')
  await db.exec('rollback to savepoint refus_prix')
  const reserver = () =>
    db.query<{ reserve: boolean }>("select reserver_rapprochement('cs_fictif') as reserve")
  expect((await reserver()).rows[0]!.reserve).toBe(true)
  expect((await reserver()).rows[0]!.reserve).toBe(false)
})

test('un montant isole inattendu reste impaye et est conserve en anomalie', async () => {
  expect(await payer('evt_prix', 'cs_prix', 899)).toEqual({ marque: false, anomalie: true })
  await redevenirProprietaire(db)
  expect(
    (await db.query<{ paye_le: unknown }>('select paye_le from dossiers where id=$1', [dossier]))
      .rows[0]!.paye_le,
  ).toBeNull()
})
test('une panne du registre annule aussi le marquage du dossier', async () => {
  await redevenirProprietaire(db)
  await db.exec(
    "create function pg_temp.refuser_registre() returns trigger language plpgsql as $$ begin raise exception 'Panne fictive du registre'; end $$; create trigger panne_registre before insert on public.registre_paiements for each row execute function pg_temp.refuser_registre()",
  )
  await devenir(db, 'serveur')
  await db.exec('savepoint panne')
  await expect(payer()).rejects.toThrow('Panne fictive du registre')
  await db.exec('rollback to savepoint panne')
  await redevenirProprietaire(db)
  expect(
    (await db.query<{ paye_le: unknown }>('select paye_le from dossiers where id=$1', [dossier]))
      .rows[0]!.paye_le,
  ).toBeNull()
  expect((await db.query('select * from evenements_paiements')).rows).toHaveLength(0)
})

test('une ancienne version tarifaire ne peut pas etre reecrite', async () => {
  await redevenirProprietaire(db)
  await db.exec('savepoint tarif')
  expect(
    await refus(
      db,
      "update tarifs_paiement set montant_cents=1000 where version='locataire-2026-09-04'",
    ),
  ).toContain('immuable')
  await db.exec('rollback to savepoint tarif')
})
test('les RPC financiers restent reserves au serveur', async () => {
  await redevenirProprietaire(db)
  for (const role of ['anon', 'authenticated', 'porteur_lien', 'depot_piece']) {
    const lignes = await db.query<{ nom: string }>(
      "select p.proname nom from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[]) and has_function_privilege($2,p.oid,'execute')",
      [
        [
          'enregistrer_paiement_locataire',
          'enregistrer_suivi_paiement',
          'etat_paiements',
          'paiements_a_rapprocher',
          'reserver_rapprochement',
          'rapprocher_paiement',
        ],
        role,
      ],
    )
    expect(lignes.rows).toHaveLength(0)
  }
})

test('un remboursement depassant le paiement reste visible comme anomalie', async () => {
  await payer()
  await db.query(
    "select enregistrer_suivi_paiement('evt_depassement','pi_fictif','ch_fictif','remboursement',901,'eur','rembourse','2026-01-01')",
  )
  expect(
    (await db.query<{ etat: { a_reconcilier: number } }>('select etat_paiements() as etat'))
      .rows[0]!.etat.a_reconcilier,
  ).toBeGreaterThan(0)
})
