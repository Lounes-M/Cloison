import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
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
 * Les logements (0069) : un bien de l'agence, ses candidats, rien d'autre.
 */

let db: PGlite, agence: string, admin: string, autreAgence: string, intrus: string

async function refus(sql: string) {
  await db.exec('savepoint refus')
  try {
    return await refusBrut(db, sql)
  } finally {
    await db.exec('rollback to savepoint refus')
  }
}

async function membre(agenceId: string, domaine: string) {
  const u = randomUUID()
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
    u,
    `admin@${domaine}`,
  ])
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agenceId, u],
  )
  return u
}

beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  agence = randomUUID()
  autreAgence = randomUUID()
  await db.query(
    "insert into agences(id,nom,domaine) values($1,'Logis','logis.invalid'),($2,'Autre','autre-logis.invalid')",
    [agence, autreAgence],
  )
  admin = await membre(agence, 'logis.invalid')
  intrus = await membre(autreAgence, 'autre-logis.invalid')
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function creerLogement(libelle = 'T2 Croix-Rousse', loyer: number | null = 85000) {
  await devenir(db, 'authenticated', admin)
  const { rows } = await db.query<{ id: string }>(
    'insert into logements(agence_id,libelle,loyer_cents) values($1,$2,$3) returning id',
    [agence, libelle, loyer],
  )
  await redevenirProprietaire(db)
  return rows[0]!.id
}

async function dossier(agenceId = agence, colonnes: Record<string, unknown> = {}) {
  const id = randomUUID()
  const noms = Object.keys(colonnes)
  await db.query(
    `insert into dossiers(id,agence_id,email_locataire${noms.map((n) => ',' + n).join('')})
     values($1,$2,'loc@example.invalid'${noms.map((_, i) => `,$${i + 3}`).join('')})`,
    [id, agenceId, ...Object.values(colonnes)],
  )
  return id
}

test("l'agence cree, renomme, archive et supprime ses logements", async () => {
  const id = await creerLogement()
  await devenir(db, 'authenticated', admin)
  await db.query("update logements set libelle='T2 Croix-Rousse, 3e',archive=true where id=$1", [
    id,
  ])
  const { rows } = await db.query('select libelle,archive,loyer_cents from logements')
  expect(rows).toEqual([{ libelle: 'T2 Croix-Rousse, 3e', archive: true, loyer_cents: 85000 }])
  await db.query('delete from logements where id=$1', [id])
  expect((await db.query('select 1 from logements')).rows).toEqual([])
})

test('un libelle vide ou trop long, un loyer nul sont refuses', async () => {
  await devenir(db, 'authenticated', admin)
  for (const [libelle, loyer] of [
    ['  ', 1000],
    ['x'.repeat(121), 1000],
    ['T3', 0],
  ] as const) {
    expect(
      await refus(
        `insert into logements(agence_id,libelle,loyer_cents) values('${agence}','${libelle}',${loyer})`,
      ),
    ).toMatch(/check constraint/)
  }
})

test("une autre agence ne voit ni ne touche les logements, ni n'en cree pour autrui", async () => {
  const id = await creerLogement()
  await devenir(db, 'authenticated', intrus)
  expect((await db.query('select * from logements')).rows).toEqual([])
  expect((await db.query("update logements set libelle='x' where id=$1", [id])).affectedRows).toBe(
    0,
  )
  expect((await db.query('delete from logements where id=$1', [id])).affectedRows).toBe(0)
  expect(
    await refus(`insert into logements(agence_id,libelle) values('${agence}','Pirate')`),
  ).toMatch(/row-level security/)
  expect((await db.query('select * from logements_de_mon_agence(true)')).rows).toEqual([])
})

test('un dossier se rattache a un logement de son agence seulement', async () => {
  const logement = await creerLogement()
  const d = await dossier()
  const ailleurs = await dossier(autreAgence)
  await devenir(db, 'authenticated', admin)
  await db.query('update dossiers set logement_id=$2 where id=$1', [d, logement])
  await redevenirProprietaire(db)
  expect(
    await refus(`update dossiers set logement_id='${logement}' where id='${ailleurs}'`),
  ).toMatch(/Logement inconnu/)
  // Meme depuis l'agence qui tient le dossier : le logement d'autrui n'existe pas.
  await devenir(db, 'authenticated', intrus)
  expect(
    await refus(`update dossiers set logement_id='${logement}' where id='${ailleurs}'`),
  ).toMatch(/Logement inconnu/)
})

test('le second garant ne se rattache pas a un logement', async () => {
  const logement = await creerLogement()
  const principal = await dossier(agence, {
    email_garant: 'pere@example.invalid',
    loyer_cents: 85000,
    logement_id: logement,
  })
  await devenirPorteur(db, principal, 'locataire')
  const { rows } = await db.query<{ dossier: string }>(
    "select dossier from designer_second_garant('mere@example.invalid')",
  )
  await redevenirProprietaire(db)
  expect(
    await refus(`update dossiers set logement_id='${logement}' where id='${rows[0]!.dossier}'`),
  ).toMatch(/dossier principal/)
})

test('le tableau compte les candidats par logement, sans les demonstrations', async () => {
  const logement = await creerLogement()
  const vide = await creerLogement('Studio', null)
  const a = await dossier(agence, { logement_id: logement })
  await dossier(agence, { logement_id: logement })
  await dossier(agence, { logement_id: logement, demonstration: true })
  await db.query("update dossiers set statut='complet' where id=$1", [a])
  await devenir(db, 'authenticated', admin)
  const { rows } = await db.query<{ id: string; candidats: number; complets: number }>(
    'select id,candidats,complets,pris from logements_de_mon_agence()',
  )
  expect(rows).toEqual(
    expect.arrayContaining([
      { id: logement, candidats: 2, complets: 1, pris: 0 },
      { id: vide, candidats: 0, complets: 0, pris: 0 },
    ]),
  )
  await db.query('update logements set archive=true where id=$1', [vide])
  expect((await db.query('select id from logements_de_mon_agence()')).rows).toEqual([
    { id: logement },
  ])
  expect((await db.query('select id from logements_de_mon_agence(true)')).rows).toHaveLength(2)
})

test('supprimer un logement detache ses dossiers sans les toucher', async () => {
  const logement = await creerLogement()
  const d = await dossier(agence, { logement_id: logement })
  await devenir(db, 'authenticated', admin)
  await db.query('delete from logements where id=$1', [logement])
  await redevenirProprietaire(db)
  expect((await db.query('select logement_id from dossiers where id=$1', [d])).rows).toEqual([
    { logement_id: null },
  ])
})

test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece'])(
  'le role %s ne lit pas les logements',
  async (role) => {
    await db.exec(`set role ${role}`)
    expect(await refus('select * from logements')).toMatch(/permission denied/)
    expect(await refus('select * from logements_de_mon_agence()')).toMatch(/permission denied/)
  },
)
