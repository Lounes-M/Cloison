import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire } from './base'

/**
 * Les compteurs d'activite (0068) : un par evenement, jamais une donnee de
 * dossier, et ils survivent a la purge.
 */

let db: PGlite, agence: string, admin: string

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
  await db.query("insert into agences(id,nom,domaine) values($1,'Activite','activite.invalid')", [
    agence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@activite.invalid',now())",
    [admin],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, admin],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function dossier(colonnes: Record<string, string | number | boolean> = {}) {
  const id = randomUUID()
  const noms = Object.keys(colonnes)
  await db.query(
    `insert into dossiers(id,agence_id,email_locataire,cree_le${noms.map((n) => ',' + n).join('')})
     values($1,$2,'loc@example.invalid',now()-interval '3 days'${noms.map((_, i) => `,$${i + 3}`).join('')})`,
    [id, agence, ...Object.values(colonnes)],
  )
  return id
}

async function compteurs() {
  await redevenirProprietaire(db)
  const { rows } = await db.query<Record<string, number>>(
    'select ouverts,pris,refuses,signes,clos,delai_prise_secondes::int as delai from activite_agence where agence_id=$1',
    [agence],
  )
  return rows[0] ?? null
}

async function lire() {
  await devenir(db, 'authenticated', admin)
  const { rows } = await db.query<Record<string, unknown>>('select * from activite_de_mon_agence()')
  await redevenirProprietaire(db)
  return rows
}

test('un dossier recu, pris puis signe se compte une fois a chaque etape', async () => {
  const id = await dossier()
  expect(await compteurs()).toMatchObject({ ouverts: 1, pris: 0 })
  await db.query("update dossiers set statut='complet' where id=$1", [id])
  await db.query("update dossiers set statut='transmis' where id=$1", [id])
  await db.query("update dossiers set statut='signe' where id=$1", [id])
  const c = await compteurs()
  expect(c).toMatchObject({ ouverts: 1, pris: 1, signes: 1, refuses: 0, clos: 0 })
  expect(c!.delai).toBeGreaterThanOrEqual(3 * 86400 - 5)
  expect(c!.delai).toBeLessThanOrEqual(3 * 86400 + 5)
})

test('refus et cloture se comptent ; un statut repete ne compte pas deux fois', async () => {
  const a = await dossier()
  const b = await dossier()
  await db.query("update dossiers set statut='garant_insuffisant' where id=$1", [a])
  await db.query("update dossiers set statut='refuse' where id=$1", [a])
  await db.query("update dossiers set statut='refuse' where id=$1", [a])
  const reference = (
    await db.query<{ reference: string }>('select reference from dossiers where id=$1', [b])
  ).rows[0]!.reference
  await devenir(db, 'authenticated', admin)
  await db.query('select clore_dossier($1,$2)', [b, reference])
  expect(await compteurs()).toMatchObject({ ouverts: 2, refuses: 1, clos: 1 })
})

test('un dossier de locataire rattache plus tard compte a son arrivee', async () => {
  const id = randomUUID()
  await db.query("insert into dossiers(id,email_locataire) values($1,'seul@example.invalid')", [id])
  expect(await compteurs()).toBeNull()
  await db.query('update dossiers set agence_id=$2 where id=$1', [id, agence])
  expect(await compteurs()).toMatchObject({ ouverts: 1 })
})

test('demonstration et second garant ne comptent pas', async () => {
  await dossier({ demonstration: true })
  const principal = await dossier({ email_garant: 'pere@example.invalid', loyer_cents: 100000 })
  await devenirPorteur(db, principal, 'locataire')
  await db.query("select * from designer_second_garant('mere@example.invalid')")
  expect(await compteurs()).toMatchObject({ ouverts: 1 })
})

test('les compteurs survivent a la purge et ne portent aucune donnee de dossier', async () => {
  const id = await dossier()
  await db.query("update dossiers set statut='refuse' where id=$1", [id])
  await db.query(
    "update dossiers set expire_le=now()-interval '1 second',cree_le=now()-interval '4 days' where id=$1",
    [id],
  )
  await db.query('select purger_les_dossiers_expires()')
  expect((await db.query('select 1 from dossiers where id=$1', [id])).rows).toEqual([])
  expect(await compteurs()).toMatchObject({ ouverts: 1, refuses: 1 })
  const { rows } = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema='public' and table_name='activite_agence' order by ordinal_position",
  )
  expect(rows.map((r) => r.column_name)).toEqual([
    'agence_id',
    'mois',
    'ouverts',
    'pris',
    'refuses',
    'signes',
    'clos',
    'delai_prise_secondes',
  ])
})

test("l'agence lit ses douze mois, rien de ceux d'une autre", async () => {
  const id = await dossier()
  await db.query("update dossiers set statut='complet' where id=$1", [id])
  await db.query("update dossiers set statut='transmis' where id=$1", [id])
  const mois = await lire()
  expect(mois).toHaveLength(12)
  expect(mois[0]).toMatchObject({ ouverts: 1, pris: 1, delai_prise_moyen_jours: '3.0' })
  expect(mois.slice(1).every((m) => m.ouverts === 0 && m.delai_prise_moyen_jours === null)).toBe(
    true,
  )

  const autre = randomUUID()
  const autreAgence = randomUUID()
  await db.query(
    "insert into agences(id,nom,domaine) values($1,'Autre','autre-activite.invalid')",
    [autreAgence],
  )
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'x@autre-activite.invalid',now())",
    [autre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [autreAgence, autre],
  )
  await devenir(db, 'authenticated', autre)
  const leurs = await db.query<{ ouverts: number }>('select * from activite_de_mon_agence()')
  expect(leurs.rows.every((m) => m.ouverts === 0)).toBe(true)
})

test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece'])(
  'le role %s ne lit ni la table ni la fonction',
  async (role) => {
    await db.exec(`set role ${role}`)
    await db.exec('savepoint s')
    await expect(db.query('select * from activite_agence')).rejects.toThrow(/permission denied/)
    await db.exec('rollback to savepoint s')
    await expect(db.query('select * from activite_de_mon_agence()')).rejects.toThrow(
      /permission denied/,
    )
  },
)

test('authenticated ne lit pas la table directement', async () => {
  await devenir(db, 'authenticated', admin)
  await expect(db.query('select * from activite_agence')).rejects.toThrow(/permission denied/)
})
