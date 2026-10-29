import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire } from './base'

/**
 * Un dossier qui rejoint une agence la previent (0071), par le domaine comme
 * par le lien de candidature ; un dossier ne avec son agence ne declenche rien.
 */

let db: PGlite, agence: string

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
  const u = randomUUID()
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
    u,
    'admin@logis.invalid',
  ])
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, u],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function dossier(colonnes: Record<string, unknown> = {}) {
  const id = randomUUID()
  const noms = Object.keys(colonnes)
  await db.query(
    `insert into dossiers(id,email_locataire${noms.map((n) => ',' + n).join('')})
     values($1,'loc@example.invalid'${noms.map((_, i) => `,$${i + 2}`).join('')})`,
    [id, ...Object.values(colonnes)],
  )
  return id
}

async function aLivrer(id: string) {
  await devenir(db, 'serveur')
  const { rows } = await db.query<{
    dossier: { statut: string; reference: string }
    contacts: string[]
  }>('select dossier, contacts from notifications_a_livrer($1)', [id])
  await redevenirProprietaire(db)
  return rows
}

test('le rattachement par domaine previent les membres de l agence', async () => {
  const id = await dossier()
  expect(await aLivrer(id)).toEqual([])
  await devenirPorteur(db, id, 'locataire')
  await db.query("select rattacher_mon_dossier('logis.invalid')")
  await redevenirProprietaire(db)
  const lignes = await aLivrer(id)
  expect(lignes).toHaveLength(1)
  expect(lignes[0]!.dossier.statut).toBe('rattache')
  expect(lignes[0]!.contacts).toEqual(['admin@logis.invalid'])
})

test('le lien de candidature previent aussi l agence', async () => {
  const { rows } = await db.query<{ id: string }>(
    "insert into logements(agence_id,libelle,code_candidature) values($1,'T2',$2) returning id",
    [agence, 'a'.repeat(32)],
  )
  expect(rows).toHaveLength(1)
  const id = await dossier()
  await devenir(db, 'serveur')
  await db.query('select candidater_dossier_neuf($1,$2)', [id, 'a'.repeat(32)])
  await redevenirProprietaire(db)
  expect((await aLivrer(id)).map((l) => l.dossier.statut)).toEqual(['rattache'])
})

test('un dossier ne avec son agence, de demonstration ou de second garant ne declenche rien', async () => {
  const agenceDes = await dossier({ agence_id: agence })
  expect(await aLivrer(agenceDes)).toEqual([])
  const demo = await dossier({ demonstration: true })
  await db.query('update dossiers set agence_id=$1 where id=$2', [agence, demo])
  expect(await aLivrer(demo)).toEqual([])
  await db.query('update dossiers set agence_id=$1 where id=$2', [agence, agenceDes])
  expect(await aLivrer(agenceDes)).toEqual([])
})

test('l evenement devient obsolete si le dossier est clos ou refuse entre-temps', async () => {
  const id = await dossier()
  await db.query('update dossiers set agence_id=$1 where id=$2', [agence, id])
  await db.query("update dossiers set statut='refuse' where id=$1", [id])
  const statuts = (await aLivrer(id)).map((l) => l.dossier.statut)
  expect(statuts).toContain('obsolete')
  expect(statuts).not.toContain('rattache')
})
