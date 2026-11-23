import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

let db: PGlite, agence: string, admin: string, membre: string, autreAdmin: string
const bien = (reference: string, plus: Record<string, unknown> = {}) => ({
  reference,
  libelle: `Bien ${reference}`,
  loyer_cents: 85000,
  ville: 'Lyon',
  surface_m2: 42,
  pieces: 2,
  meuble: null,
  disponible_le: '2027-01-15',
  ...plus,
})
const un = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<{ r: T }>(sql, params)).rows[0]!.r
const importer = (biens: unknown) =>
  un<{ crees: number; mis_a_jour: number } | null>("select importer_logements('apimo',$1) r", [
    JSON.stringify(biens),
  ])

beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  agence = randomUUID()
  admin = randomUUID()
  membre = randomUUID()
  autreAdmin = randomUUID()
  const autre = randomUUID()
  await db.query(
    "insert into agences(id,nom,domaine) values($1,'Import','import.invalid'),($2,'Autre','autre.invalid')",
    [agence, autre],
  )
  await db.query(
    `insert into auth.users(id,email,email_confirmed_at) values
     ($1,'admin@import.invalid',now()),($2,'membre@import.invalid',now()),($3,'admin@autre.invalid',now())`,
    [admin, membre, autreAdmin],
  )
  await db.query(
    `insert into membres_agence(agence_id,utilisateur_id,role) values
     ($1,$2,'admin'),($1,$3,'membre'),($4,$5,'admin')`,
    [agence, admin, membre, autre, autreAdmin],
  )
  await devenir(db, 'authenticated', admin)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

test('seul un administrateur regle la connexion, avec un identifiant numerique', async () => {
  expect(await un("select regler_connexion_logiciel('apimo','../7') r")).toBe(false)
  expect(await un("select regler_connexion_logiciel('autre','42') r")).toBe(false)
  await devenir(db, 'authenticated', membre)
  expect(await un("select regler_connexion_logiciel('apimo','42') r")).toBe(false)
  expect(await compter(db, 'connexions_logiciels')).toBe(0)
  await devenir(db, 'authenticated', admin)
  expect(await un("select regler_connexion_logiciel('apimo','42') r")).toBe(true)
  expect(await compter(db, 'connexions_logiciels')).toBe(1)
  // Le membre ne lit pas la connexion ; l'autre agence non plus.
  await devenir(db, 'authenticated', membre)
  expect(await compter(db, 'connexions_logiciels')).toBe(0)
  await devenir(db, 'authenticated', autreAdmin)
  expect(await compter(db, 'connexions_logiciels')).toBe(0)
  await devenir(db, 'authenticated', admin)
  expect(await un("select regler_connexion_logiciel('apimo','') r")).toBe(true)
  expect(await compter(db, 'connexions_logiciels')).toBe(0)
})

test('la table et les colonnes d origine ne s ecrivent pas directement', async () => {
  await db.exec('savepoint avant')
  for (const sql of [
    `insert into connexions_logiciels(agence_id,logiciel,identifiant) values('${agence}','apimo','42')`,
    `insert into logements(agence_id,libelle,source,reference_externe) values('${agence}','x','apimo','1')`,
    `update logements set reference_externe='1'`,
  ]) {
    expect(await refus(db, sql)).toMatch(/permission denied/)
    await db.exec('rollback to savepoint avant')
  }
})

test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne peut ni regler, ni reserver, ni importer',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await db.exec('savepoint avant')
    for (const sql of [
      "select regler_connexion_logiciel('apimo','42')",
      "select reserver_import_logiciel('apimo')",
      "select importer_logements('apimo','[]')",
    ]) {
      expect(await refus(db, sql)).toMatch(/permission denied/)
      await db.exec('rollback to savepoint avant')
    }
  },
)

test('un import par minute, et jamais sans connexion', async () => {
  expect(await un("select reserver_import_logiciel('apimo') r")).toBeNull()
  await un("select regler_connexion_logiciel('apimo','42') r")
  await devenir(db, 'authenticated', membre)
  expect(await un("select reserver_import_logiciel('apimo') r")).toBeNull()
  await devenir(db, 'authenticated', admin)
  expect(await un("select reserver_import_logiciel('apimo') r")).toBe('42')
  expect(await un("select reserver_import_logiciel('apimo') r")).toBeNull()
  await redevenirProprietaire(db)
  await db.exec("update connexions_logiciels set demande_le = demande_le - interval '2 minutes'")
  await devenir(db, 'authenticated', admin)
  expect(await un("select reserver_import_logiciel('apimo') r")).toBe('42')
})

test('l import cree puis met a jour, sans doublon ni effacement, dans la seule agence courante', async () => {
  expect(await importer([bien('1')])).toBeNull()
  await un("select regler_connexion_logiciel('apimo','42') r")
  await devenir(db, 'authenticated', membre)
  expect(await importer([bien('1')])).toBeNull()
  await devenir(db, 'authenticated', admin)
  expect(await importer([bien('1'), bien('2', { loyer_cents: null, ville: null })])).toEqual({
    crees: 2,
    mis_a_jour: 0,
  })
  // L'agence complete et archive ; un nouvel import ne defait ni l'un ni l'autre.
  await db.exec(
    "update logements set ville='Villeurbanne', archive=true where reference_externe='2'",
  )
  expect(
    await importer([
      bien('1', { libelle: 'T2 renomme', loyer_cents: 90000 }),
      bien('2', { loyer_cents: null, ville: null, surface_m2: null }),
      bien('3'),
    ]),
  ).toEqual({ crees: 1, mis_a_jour: 2 })
  const { rows } = await db.query(
    'select reference_externe r, libelle, loyer_cents::int loyer, ville, surface_m2, archive from logements order by reference_externe',
  )
  expect(rows).toEqual([
    { r: '1', libelle: 'T2 renomme', loyer: 90000, ville: 'Lyon', surface_m2: 42, archive: false },
    {
      r: '2',
      libelle: 'Bien 2',
      loyer: null,
      ville: 'Villeurbanne',
      surface_m2: 42,
      archive: true,
    },
    { r: '3', libelle: 'Bien 3', loyer: 85000, ville: 'Lyon', surface_m2: 42, archive: false },
  ])
  expect(await un('select importe_le is not null r from connexions_logiciels')).toBe(true)
  await devenir(db, 'authenticated', autreAdmin)
  expect(await compter(db, 'logements')).toBe(0)
})

test('un lot trop grand ou une valeur hors bornes n inscrit rien', async () => {
  await un("select regler_connexion_logiciel('apimo','42') r")
  expect(await importer(Array.from({ length: 201 }, (_, i) => bien(String(i))))).toBeNull()
  expect(await importer({ reference: '1' })).toBeNull()
  await db.exec('savepoint avant')
  await expect(importer([bien('1'), bien('2', { surface_m2: 4 })])).rejects.toThrow(/check/)
  await db.exec('rollback to savepoint avant')
  await expect(importer([bien('mauvaise reference !')])).rejects.toThrow(/check/)
  await db.exec('rollback to savepoint avant')
  expect(await compter(db, 'logements')).toBe(0)
})
