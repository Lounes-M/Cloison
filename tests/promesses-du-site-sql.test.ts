import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { baseDEssai, devenir, redevenirProprietaire, reserverObjetDEssai } from './base'

/**
 * Migration 0087 : ce que le site promet, tenu par la base.
 *
 * L'agence ne recoit rien avant un dossier complet, un dossier paye s'efface
 * trois mois apres son ouverture, les empreintes durent une heure et les
 * demandes de demonstration douze mois.
 */

let db: PGlite, dossier: string, agence: string, membre: string, piece: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  dossier = randomUUID()
  agence = randomUUID()
  membre = randomUUID()
  piece = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Essai','promesses.invalid')", [
    agence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@promesses.invalid',now())",
    [membre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, membre],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,loyer_cents) values($1,$2,'locataire@example.invalid',100000)",
    [dossier, agence],
  )
  await reserverObjetDEssai(db, dossier, `${dossier}/${piece}`)
  await db.query(
    "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values($1,$2,'bulletin_paie',$3,100,'application/pdf')",
    [piece, dossier, `${dossier}/${piece}`],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function piecesVuesParLAgence() {
  await devenir(db, 'authenticated', membre)
  const { rows } = await db.query('select id from pieces where dossier_id=$1', [dossier])
  await redevenirProprietaire(db)
  return rows.length
}
async function statut(valeur: string) {
  await db.query('update dossiers set statut=$2 where id=$1', [dossier, valeur])
}

test('l agence ne lit aucune piece tant que le dossier n a jamais ete complet', async () => {
  expect(await piecesVuesParLAgence()).toBe(0)
  await statut('depot_en_cours')
  expect(await piecesVuesParLAgence()).toBe(0)
})

test('l agence lit les pieces des que le dossier est complet', async () => {
  await statut('depot_en_cours')
  await statut('complet')
  expect(await piecesVuesParLAgence()).toBe(1)
})

test('un dossier revenu en depot pour un complement reste lisible par l agence', async () => {
  await statut('depot_en_cours')
  await statut('complet')
  await statut('depot_en_cours')
  expect(await piecesVuesParLAgence()).toBe(1)
})

test('un dossier paye expire trois mois apres son ouverture, pas apres son paiement', async () => {
  // Un dossier sans piece, ouvert depuis vingt jours : le cas ou les deux dates divergent.
  const ouvert = (
    await db.query<{ id: string }>(
      "insert into dossiers(email_locataire,cree_le) values('paye@example.invalid',now()-interval '20 days') returning id",
    )
  ).rows[0]!.id
  await devenir(db, 'serveur')
  await db.query("select marquer_dossier_paye($1,'cs_test_promesses')", [ouvert])
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ ok: boolean }>(
    "select expire_le=cree_le+interval '3 months' as ok from dossiers where id=$1",
    [ouvert],
  )
  expect(rows[0]!.ok).toBe(true)
})

test('la purge retire les empreintes de plus d une heure et garde les fenetres en cours', async () => {
  await db.exec(
    `insert into debits(cle,fenetre,compte) values
      ('essai:empreinte:ancienne',now()-interval '61 minutes',1),
      ('essai:empreinte:courante',now()-interval '30 minutes',1)`,
  )
  await devenir(db, 'serveur')
  await db.query('select purger_les_dossiers_expires()')
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ cle: string }>(
    "select cle from debits where cle like 'essai:%'",
  )
  expect(rows.map((r) => r.cle)).toEqual(['essai:empreinte:courante'])
})

test('la purge retire les demandes d agence de plus de douze mois, et elles seules', async () => {
  await db.exec(
    `insert into demandes_agence(nom_agence,email,ville,dossiers_par_an,cree_le) values
      ('Agence ancienne','ancienne@example.invalid','Lyon','10-50',now()-interval '13 months'),
      ('Agence recente','recente@example.invalid','Lyon','10-50',now()-interval '11 months')`,
  )
  await devenir(db, 'serveur')
  await db.query('select purger_les_dossiers_expires()')
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ email: string }>('select email from demandes_agence')
  expect(rows.map((r) => r.email)).toEqual(['recente@example.invalid'])
})
