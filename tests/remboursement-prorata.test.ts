import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { baseDEssai } from './base'
import { diagnostiquerPaiement } from '../scripts/diagnostic-paiement.mjs'
import {
  FORMAT_REMBOURSEMENT,
  configurationRemboursement,
  proposerRemboursement,
} from '../scripts/preparer-remboursement.mjs'
import { executerRemboursement, phraseDeConfirmation } from '../scripts/executer-remboursement.mjs'
import {
  ajouterMois,
  calculerRemboursement,
  dernierJourDeRetractation,
  estJourNonOuvrable,
  jourDeParis,
} from '../lib/exploitation/remboursement-prorata.mjs'

const calcul = (payeLe: string, demandeJour: string, dejaRembourseCents = 0, montantCents = 900) =>
  calculerRemboursement({ montantCents, payeLe, demandeJour, dejaRembourseCents })

test('la retenue suit la part des trois mois ecoulee, arrondie en faveur du locataire', () => {
  // Du 2 novembre au 2 fevrier : 92 jours. Cinq jours ecoules : 900 x 5 / 92 = 48,9 centimes.
  expect(calcul('2026-11-02T10:00:00Z', '2026-11-07')).toMatchObject({
    paye_jour: '2026-11-02',
    fin_jour: '2027-02-02',
    jours_ecoules: 5,
    jours_total: 92,
    retenue_cents: 48,
    a_rembourser_cents: 852,
    dans_le_delai: true,
    rembourser_au_plus_tard: '2026-11-21',
  })
  expect(calcul('2026-11-02T10:00:00Z', '2026-11-02')).toMatchObject({
    retenue_cents: 0,
    a_rembourser_cents: 900,
  })
})
test('les sommes deja rendues sont deduites, sans jamais devenir negatives', () => {
  expect(calcul('2026-11-02T10:00:00Z', '2026-11-07', 400).a_rembourser_cents).toBe(452)
  expect(calcul('2026-11-02T10:00:00Z', '2026-11-07', 900).a_rembourser_cents).toBe(0)
})
test('le jour civil est celui de Paris, pas celui du serveur', () => {
  expect(jourDeParis('2026-11-02T23:30:00Z')).toBe('2026-11-03')
  expect(jourDeParis('2026-07-01T21:59:00Z')).toBe('2026-07-01')
  expect(jourDeParis('2026-07-01T22:00:00Z')).toBe('2026-07-02')
})
test('le delai exclut le jour du paiement et se prolonge au premier jour ouvrable', () => {
  // Lundi 2 novembre + 14 = lundi 16 novembre.
  expect(dernierJourDeRetractation('2026-11-02')).toBe('2026-11-16')
  expect(calcul('2026-11-02T10:00:00Z', '2026-11-16').dans_le_delai).toBe(true)
  expect(calcul('2026-11-02T10:00:00Z', '2026-11-17').dans_le_delai).toBe(false)
  // Samedi 21 novembre : report au lundi 23.
  expect(dernierJourDeRetractation('2026-11-07')).toBe('2026-11-23')
  // Vendredi 25 decembre, ferie, puis week-end : report au lundi 28.
  expect(dernierJourDeRetractation('2026-12-11')).toBe('2026-12-28')
  expect(calcul('2026-11-02T10:00:00Z', '2026-11-01')).toMatchObject({
    dans_le_delai: false,
    retenue_cents: 0,
  })
})
test('les jours feries mobiles et les fins de mois sont exacts', () => {
  // Paques 2026 : dimanche 5 avril. Lundi de Paques, Ascension, lundi de Pentecote.
  for (const jour of ['2026-04-06', '2026-05-14', '2026-05-25', '2027-03-29', '2026-07-14'])
    expect(estJourNonOuvrable(jour)).toBe(true)
  for (const jour of ['2026-04-07', '2026-05-15', '2026-11-10'])
    expect(estJourNonOuvrable(jour)).toBe(false)
  expect(ajouterMois('2026-11-30', 3)).toBe('2027-02-28')
  expect(ajouterMois('2027-11-30', 3)).toBe('2028-02-29')
  expect(ajouterMois('2026-10-15', 3)).toBe('2027-01-15')
})
test('une entree incoherente est refusee', () => {
  expect(() => calcul('2026-11-02T10:00:00Z', '2026-02-30')).toThrow()
  expect(() => calcul('pas une date', '2026-11-07')).toThrow()
  expect(() => calcul('2026-11-02T10:00:00Z', '2026-11-07', -1)).toThrow()
  expect(() => calcul('2026-11-02T10:00:00Z', '2026-11-07', 0, 0)).toThrow()
})

let db: PGlite
const dossier = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec(`delete from rapprochements_paiements; delete from evenements_paiements;
    delete from registre_paiements; delete from sessions_paiement; delete from dossiers`)
  await db.query(
    "insert into dossiers(id,email_locataire) values ($1,'CONFIDENTIEL@example.invalid')",
    [dossier],
  )
  await db.query("insert into sessions_paiement(dossier_id,session_ref) values ($1,'cs_fictif')", [
    dossier,
  ])
  await db.query(
    `select enregistrer_paiement_locataire('evt_fictif','cs_fictif','pi_fictif',$1,900,
    'eur','locataire-2026-09-04',now()-interval '5 days')`,
    [dossier],
  )
})
const ilYA = (jours: number) => jourDeParis(Date.now() - jours * 86400000)
const proposer = async (demande = ilYA(2)) =>
  proposerRemboursement(await diagnostiquerPaiement(db, 'cs_fictif'), demande)

test('la proposition chiffre le remboursement sans rien ecrire ni exposer le dossier', async () => {
  const avant = await db.query('select etat_paiements() as etat')
  const p = await proposer()
  expect(p).toMatchObject({
    version: 1,
    eligible: true,
    motifs: [],
    reference_session: 'cs_fictif',
    reference_paiement: 'pi_fictif',
    devise: 'eur',
    montant_paye_cents: 900,
    jours_ecoules: 3,
    deja_rembourse_cents: 0,
  })
  expect(p.a_rembourser_cents).toBe(900 - Math.floor((900 * 3) / p.jours_total!))
  expect(JSON.stringify(p)).not.toMatch(/CONFIDENTIEL|aaaaaaaa/)
  expect((await db.query('select etat_paiements() as etat')).rows).toEqual(avant.rows)
})
test('un remboursement deja recu est deduit et un remboursement complet bloque', async () => {
  await db.query(`insert into evenements_paiements(id,nature,reference_objet,reference_paiement,montant_cents,devise,etat,survenu_le)
    values ('evt_r1','remboursement','ch_fictif','pi_fictif',300,'eur','rembourse',now()),
           ('evt_r0','remboursement','ch_fictif','pi_fictif',100,'eur','rembourse',now())`)
  const p = await proposer()
  expect(p).toMatchObject({ eligible: true, deja_rembourse_cents: 300 })
  expect(p.a_rembourser_cents).toBe(900 - p.retenue_cents! - 300)
  await db.query(`insert into evenements_paiements(id,nature,reference_objet,reference_paiement,montant_cents,devise,etat,survenu_le)
    values ('evt_r2','remboursement','ch_fictif','pi_fictif',900,'eur','rembourse',now())`)
  expect(await proposer()).toMatchObject({
    eligible: false,
    motifs: ['rien_a_rembourser'],
    a_rembourser_cents: 0,
  })
})
test('hors delai, litige, anomalie ou reference partagee bloquent la proposition', async () => {
  await db.query(
    "update registre_paiements set survenu_le=now()-interval '40 days' where reference_session='cs_fictif'",
  )
  expect((await proposer()).motifs).toEqual(['hors_delai'])
  await db.query(
    "update registre_paiements set survenu_le=now()-interval '5 days' where reference_session='cs_fictif'",
  )
  expect((await proposer(ilYA(9))).motifs).toEqual(['demande_incoherente'])
  expect((await proposer(ilYA(-2))).motifs).toEqual(['demande_incoherente'])
  await db.query(`insert into evenements_paiements(id,nature,reference_objet,reference_paiement,montant_cents,devise,etat,survenu_le)
    values ('evt_litige','litige','dp_fictif','pi_fictif',900,'eur','won',now())`)
  expect((await proposer()).motifs).toEqual(['litige'])
  await db.query("delete from evenements_paiements where id='evt_litige'")
  await db.query("update registre_paiements set anomalie=true where reference_session='cs_fictif'")
  expect((await proposer()).motifs).toEqual(['paiement_a_reconcilier'])
  await db.query(
    "update registre_paiements set anomalie=false,reference_paiement=null where reference_session='cs_fictif'",
  )
  expect((await proposer()).motifs).toContain('reference_paiement_absente')
  await db.query(
    "update registre_paiements set reference_paiement='pi_fictif' where reference_session='cs_fictif'",
  )
  await db.query(
    `insert into registre_paiements(reference_session,reference_paiement,source_dossier,montant_cents,devise,tarif_version,survenu_le)
    values ('cs_collision','pi_fictif',$1,900,'eur','locataire-2026-09-04',now())`,
    [dossier],
  )
  expect((await proposer()).motifs).toEqual(['reference_partagee'])
  await db.query('delete from registre_paiements')
  expect(await proposer()).toMatchObject({ eligible: false, motifs: ['paiement_introuvable'] })
})
test('la configuration exige une date de demande au jour pres', () => {
  const config = {
    connexion: 'postgres://fictif@localhost/cloison_test',
    destination: '/inutilise',
    reference: 'cs_fictif',
    demande_le: '2026-11-07',
  }
  expect(configurationRemboursement(config).demandeJour).toBe('2026-11-07')
  expect(() =>
    configurationRemboursement({ ...config, demande_le: '2026-11-07T10:00:00Z' }),
  ).toThrow()
  expect(() => configurationRemboursement({ ...config, montant: 900 })).toThrow()
  const { demande_le: _, ...sans } = config
  expect(() => configurationRemboursement(sans)).toThrow()
})

const cle = 'sk_test_' + 'a'.repeat(24)
const operation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
function entree(p: Record<string, unknown>, confirmation?: string) {
  const contenu = JSON.stringify(p)
  return {
    cle_stripe: cle,
    operation,
    confirmation: confirmation ?? phraseDeConfirmation(p as never),
    rapport: {
      format: FORMAT_REMBOURSEMENT,
      sha256: createHash('sha256').update(contenu).digest('hex'),
      contenu,
    },
  }
}
function fournisseur(
  charge: Record<string, unknown> = {},
  intention: Record<string, unknown> = {},
) {
  return {
    paymentIntents: {
      retrieve: vi.fn(async () => ({
        id: 'pi_fictif',
        status: 'succeeded',
        currency: 'eur',
        amount_received: 900,
        latest_charge: { paid: true, disputed: false, amount_refunded: 0, ...charge },
        ...intention,
      })),
    },
    refunds: {
      create: vi.fn(async (parametres: Record<string, unknown>) => ({
        amount: parametres.amount,
        currency: 'eur',
        status: 'succeeded',
      })),
    },
  }
}

test('le remboursement part avec le montant propose et une cle d idempotence stable', async () => {
  const p = await proposer()
  const api = fournisseur()
  expect(await executerRemboursement(api, entree(p))).toEqual({ etat: 'succeeded' })
  expect(api.refunds.create).toHaveBeenCalledTimes(1)
  expect(api.refunds.create).toHaveBeenCalledWith(
    expect.objectContaining({
      payment_intent: 'pi_fictif',
      amount: p.a_rembourser_cents,
      reason: 'requested_by_customer',
    }),
    { idempotencyKey: `cloison-remboursement-${operation}` },
  )
})
test('sans confirmation exacte, rien n est demande a Stripe', async () => {
  const p = await proposer()
  const api = fournisseur()
  const refus = [
    entree(p, 'oui'),
    entree(p, phraseDeConfirmation({ ...p, a_rembourser_cents: 900 } as never)),
    { ...entree(p), cle_stripe: 'pk_test_' + 'a'.repeat(24) },
    { ...entree(p), operation: 'pas-un-uuid' },
    { ...entree(p), rapport: { ...entree(p).rapport, sha256: '0'.repeat(64) } },
    { ...entree(p), rapport: { ...entree(p).rapport, format: 'cloison-diagnostic-paiement-v1' } },
    entree({ ...p, eligible: false, motifs: ['hors_delai'] }),
    entree({ ...p, a_rembourser_cents: 0 }),
    entree({ ...p, a_rembourser_cents: 901 }),
    entree({ ...p, observe_le: new Date(Date.now() - 25 * 3600000).toISOString() }),
  ]
  for (const e of refus) await expect(executerRemboursement(api, e)).rejects.toThrow()
  expect(api.paymentIntents.retrieve).not.toHaveBeenCalled()
  expect(api.refunds.create).not.toHaveBeenCalled()
})
test('un etat Stripe different de la proposition arrete l envoi', async () => {
  const p = await proposer()
  for (const api of [
    fournisseur({ amount_refunded: 100 }),
    fournisseur({ disputed: true }),
    fournisseur({}, { amount_received: 2900 }),
    fournisseur({}, { status: 'requires_payment_method' }),
    fournisseur({}, { latest_charge: null }),
  ]) {
    await expect(executerRemboursement(api, entree(p))).rejects.toThrow('Etat fournisseur')
    expect(api.refunds.create).not.toHaveBeenCalled()
  }
})
test('les lanceurs refusent un terminal ou un argument et ne journalisent rien de prive', () => {
  for (const script of ['preparer-remboursement.mjs', 'executer-remboursement.mjs']) {
    const r = spawnSync(process.execPath, [resolve('scripts', script)], {
      input: JSON.stringify({ cle_stripe: cle, reference: 'cs_secret_fictif' }),
      encoding: 'utf8',
    })
    expect(r.status).toBe(1)
    expect(r.stdout + r.stderr).not.toMatch(/sk_test|cs_secret/)
  }
})
test('aucune tache planifiee, route ou autre script ne peut envoyer un remboursement', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const lire = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((f) =>
      f.isDirectory()
        ? lire(resolve(dossier, f.name))
        : /\.(mjs|ts|tsx|yml|json|sh)$/.test(f.name)
          ? [resolve(dossier, f.name)]
          : [],
    )
  const fichiers = ['app', 'lib', 'scripts', 'workers', '.github', 'vercel.json', 'package.json']
    .flatMap((c) => (c.includes('.json') ? [resolve(c)] : lire(resolve(c))))
    .filter((f) => !f.endsWith('executer-remboursement.mjs') && !f.endsWith('.d.mts'))
  for (const f of fichiers) {
    const texte = readFileSync(f, 'utf8')
    expect(texte, f).not.toMatch(/executer-remboursement|refunds\s*\.\s*create/)
  }
})
