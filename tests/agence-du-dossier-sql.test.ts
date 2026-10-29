import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire } from './base'

/**
 * Le locataire et le garant savent quelle agence suit leur dossier (0073) :
 * son nom, et le logement s'il y en a un, pour leur seul dossier.
 */

let db: PGlite, agence: string, logement: string

beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  agence = randomUUID()
  await db.query(
    `insert into agences(id,nom,domaine,siren,carte_pro,statut,verifiee_le)
     values($1,'Logis','logis.invalid','123456789','CPI recette','verifiee',now())`,
    [agence],
  )
  const { rows } = await db.query<{ id: string }>(
    "insert into logements(agence_id,libelle,ville) values($1,'T2 Gerland','Lyon 7e') returning id",
    [agence],
  )
  logement = rows[0]!.id
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function dossier(colonnes: Record<string, unknown> = {}) {
  const id = randomUUID()
  const noms = Object.keys(colonnes)
  await db.query(
    `insert into dossiers(id,email_locataire,email_garant${noms.map((n) => ',' + n).join('')})
     values($1,'loc@example.invalid','gar@example.invalid'${noms.map((_, i) => `,$${i + 2}`).join('')})`,
    [id, ...Object.values(colonnes)],
  )
  return id
}

async function lire(id: string, partie: string) {
  await devenirPorteur(db, id, partie)
  const { rows } = await db.query('select * from agence_de_mon_dossier()')
  await redevenirProprietaire(db)
  return rows
}

test('le locataire et le garant lisent l agence et le logement de leur dossier', async () => {
  const id = await dossier({ agence_id: agence, logement_id: logement })
  const attendu = [{ agence: 'Logis', logement: 'T2 Gerland', ville: 'Lyon 7e' }]
  expect(await lire(id, 'locataire')).toEqual(attendu)
  expect(await lire(id, 'garant')).toEqual(attendu)

  const sansLogement = await dossier({ agence_id: agence })
  expect(await lire(sansLogement, 'locataire')).toEqual([
    { agence: 'Logis', logement: null, ville: null },
  ])
})

test('rien sans agence, ni pour une demonstration', async () => {
  expect(await lire(await dossier(), 'locataire')).toEqual([])
  expect(await lire(await dossier({ agence_id: agence, demonstration: true }), 'garant')).toEqual(
    [],
  )
})

test('le second garant voit le logement du dossier principal', async () => {
  const principal = await dossier({ agence_id: agence, logement_id: logement })
  const second = await dossier({ agence_id: agence, dossier_principal: principal })
  expect(await lire(second, 'garant')).toEqual([
    { agence: 'Logis', logement: 'T2 Gerland', ville: 'Lyon 7e' },
  ])
})

test('seul le porteur de lien appelle la fonction', async () => {
  for (const role of ['anon', 'authenticated', 'serveur'] as const) {
    await devenir(db, role)
    await db.exec('savepoint refus')
    await expect(db.query('select * from agence_de_mon_dossier()')).rejects.toThrow(
      /permission denied/,
    )
    await db.exec('rollback to savepoint refus')
    await redevenirProprietaire(db)
  }
})
