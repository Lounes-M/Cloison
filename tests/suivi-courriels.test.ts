import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'
let db: PGlite
let moment: string
const id = '00000000-0000-4000-8000-000000000081'
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => db.close())
beforeEach(async () => {
  moment = new Date().toISOString()
  await db.exec('begin')
  await devenir(db, 'serveur')
  await db.query('select mettre_courriel_en_file($1,$2)', [id, 'chiffre'])
})
afterEach(async () => {
  await db.exec('rollback')
})
async function bail() {
  return (await db.query<{ bail: string }>('select bail from prendre_courriels()')).rows[0]!.bail
}
async function etat() {
  await redevenirProprietaire(db)
  return (
    await db.query<{
      fournisseur_id: string | null
      etat_livraison: string | null
      contenu: string | null
      a_reconcilier: boolean
    }>(
      'select fournisseur_id,etat_livraison,contenu,a_reconcilier from courriels_sortants where id=$1',
      [id],
    )
  ).rows[0]!
}
async function evenement(type: string, cle = 'evt_fictif', date = moment) {
  await devenir(db, 'serveur')
  return db.query('select enregistrer_evenement_courriel($1,$2,$3,$4,$5)', [
    cle,
    'resend_fictif',
    id,
    type,
    date,
  ])
}

test('les roles publics ne lisent ni ne forgent le suivi fournisseur', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien'] as const) {
    await devenir(db, role)
    expect(await interdit('select * from evenements_courriels')).toContain('permission denied')
    expect(
      await interdit(
        `select enregistrer_evenement_courriel('evt','resend',null,'email.sent',now())`,
      ),
    ).toContain('permission denied')
  }
})
test('un bail obsolete ne confirme pas un envoi et un acquittement exact conserve sa reference', async () => {
  const valide = await bail()
  expect(
    (
      await db.query<{ ok: boolean }>('select acquitter_courriel($1,$2,$3) as ok', [
        id,
        id,
        'resend_fictif',
      ])
    ).rows[0]!.ok,
  ).toBe(false)
  expect(
    (
      await db.query<{ ok: boolean }>('select acquitter_courriel($1,$2,$3) as ok', [
        id,
        valide,
        'resend_fictif',
      ])
    ).rows[0]!.ok,
  ).toBe(true)
  expect(await etat()).toEqual({
    fournisseur_id: 'resend_fictif',
    etat_livraison: 'accepte',
    contenu: null,
    a_reconcilier: false,
  })
})
test('le webhook peut preceder l acquittement et un evenement ancien ne degrade pas la livraison', async () => {
  const valide = await bail()
  await evenement('email.delivered')
  await evenement('email.sent', 'evt_ancien', new Date(Date.now() - 1000).toISOString())
  await evenement('email.delivered')
  expect(
    (
      await db.query<{ ok: boolean }>('select acquitter_courriel($1,$2,$3) as ok', [
        id,
        valide,
        'resend_fictif',
      ])
    ).rows[0]!.ok,
  ).toBe(true)
  expect((await etat()).etat_livraison).toBe('livre')
  expect(
    (await db.query<{ n: number }>('select count(*)::int as n from evenements_courriels')).rows[0]!
      .n,
  ).toBe(2)
})
test('un rejet reste visible apres un evenement livre et ne relance jamais un envoi', async () => {
  await bail()
  await evenement('email.bounced')
  await evenement('email.delivered', 'evt_livre')
  expect((await etat()).etat_livraison).toBe('rejete')
  await devenir(db, 'serveur')
  expect((await db.query('select * from prendre_courriels()')).rows).toEqual([])
  const rapport = (
    await db.query<{ r: { alertes: { courriels_a_reconcilier: number } } }>(
      'select rapport_exploitation() as r',
    )
  ).rows[0]!.r
  expect(rapport.alertes.courriels_a_reconcilier).toBe(1)
})
test('une nouvelle reference ne remplace pas celle deja acceptee', async () => {
  const valide = await bail()
  await db.query('select acquitter_courriel($1,$2,$3)', [id, valide, 'resend_fictif'])
  await db.exec('savepoint conflit')
  await expect(
    db.query('select enregistrer_evenement_courriel($1,$2,$3,$4,now())', [
      'evt_conflit',
      'autre_reference',
      id,
      'email.delivered',
    ]),
  ).rejects.toThrow('Reference fournisseur differente')
  await db.exec('rollback to savepoint conflit')
  expect((await etat()).fournisseur_id).toBe('resend_fictif')
})
test('la supervision voit une file jamais essayee et la maintenance purge les anciennes metadonnees', async () => {
  await redevenirProprietaire(db)
  await db.query("update courriels_sortants set cree_le=now()-interval '2 hours' where id=$1", [id])
  await devenir(db, 'serveur')
  expect(
    (
      await db.query<{ r: { alertes: { courriels_a_reconcilier: number } } }>(
        'select rapport_exploitation() as r',
      )
    ).rows[0]!.r.alertes.courriels_a_reconcilier,
  ).toBe(1)
  await evenement('email.delivered')
  await redevenirProprietaire(db)
  await db.query("update courriels_sortants set cree_le=now()-interval '91 days' where id=$1", [id])
  await devenir(db, 'serveur')
  await db.query('select etat_file_courriels()')
  await redevenirProprietaire(db)
  expect((await db.query('select * from evenements_courriels')).rows).toEqual([])
  expect((await db.query('select * from courriels_sortants')).rows).toEqual([])
})

async function interdit(sql: string) {
  await db.exec('savepoint refus_suivi')
  const resultat = await refus(db, sql)
  await db.exec('rollback to savepoint refus_suivi')
  return resultat
}

test('un retour fournisseur ne reactive pas un courriel annule', async () => {
  await bail()
  await redevenirProprietaire(db)
  await db.query(
    'update courriels_sortants set annule_le=now(),contenu=null,bail=null where id=$1',
    [id],
  )
  await evenement('email.delivered')
  await devenir(db, 'serveur')
  expect((await db.query('select * from prendre_courriels()')).rows).toEqual([])
  await redevenirProprietaire(db)
  expect(
    (
      await db.query<{ annule: boolean }>(
        'select annule_le is not null as annule from courriels_sortants where id=$1',
        [id],
      )
    ).rows[0]!.annule,
  ).toBe(true)
})
test('des evenements retardes recents ne masquent pas une livraison en retard depuis une heure', async () => {
  await evenement('email.sent')
  await redevenirProprietaire(db)
  await db.query("update courriels_sortants set envoye_le=now()-interval '2 hours' where id=$1", [
    id,
  ])
  await evenement('email.delivery_delayed', 'evt_retard')
  expect(
    (
      await db.query<{ r: { alertes: { courriels_a_reconcilier: number } } }>(
        'select rapport_exploitation() as r',
      )
    ).rows[0]!.r.alertes.courriels_a_reconcilier,
  ).toBe(1)
})
