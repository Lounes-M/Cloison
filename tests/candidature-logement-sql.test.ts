import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire } from './base'

/**
 * Le lien de candidature d'un logement (0070) : un code aleatoire, revocable,
 * qui ne fait que rattacher un dossier de locataire a ce logement.
 */

let db: PGlite, agence: string, admin: string, autreAgence: string, intrus: string

async function refus(sql: string, params: unknown[] = []) {
  await db.exec('savepoint refus')
  let refuse = false
  try {
    await db.query(sql, params)
  } catch {
    refuse = true
  } finally {
    await db.exec('rollback to savepoint refus')
  }
  if (!refuse) throw new Error(`Cette requete aurait du etre refusee : ${sql}`)
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
    `insert into agences(id,nom,domaine,siren,carte_pro,statut,verifiee_le) values
       ($1,'Logis','logis.invalid','123456789','CPI recette','verifiee',now()),
       ($2,'Autre','autre-logis.invalid','987654321','CPI recette','verifiee',now())`,
    [agence, autreAgence],
  )
  admin = await membre(agence, 'logis.invalid')
  intrus = await membre(autreAgence, 'autre-logis.invalid')
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function logementOuvert(archive = false) {
  await devenir(db, 'authenticated', admin)
  const { rows } = await db.query<{ id: string }>(
    "insert into logements(agence_id,libelle,loyer_cents) values($1,'T2 Gerland',78000) returning id",
    [agence],
  )
  const id = rows[0]!.id
  const { rows: c } = await db.query<{ code: string }>(
    'select regler_candidature_logement($1,true) as code',
    [id],
  )
  if (archive) await db.query('update logements set archive=true where id=$1', [id])
  await redevenirProprietaire(db)
  return { id, code: c[0]!.code }
}

async function dossierLibre(colonnes: Record<string, unknown> = {}) {
  const id = randomUUID()
  const noms = Object.keys(colonnes)
  await db.query(
    `insert into dossiers(id,email_locataire${noms.map((n) => ',' + n).join('')})
     values($1,'loc@example.invalid'${noms.map((_, i) => `,$${i + 2}`).join('')})`,
    [id, ...Object.values(colonnes)],
  )
  return id
}

async function rattachement(id: string) {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ agence_id: string | null; logement_id: string | null }>(
    'select agence_id,logement_id from dossiers where id=$1',
    [id],
  )
  return rows[0]
}

test("l'agence ouvre un code aleatoire, le renouvelle, le ferme, et l'archivage l'efface", async () => {
  const { id, code } = await logementOuvert()
  expect(code).toMatch(/^[a-f0-9]{32}$/)
  await devenir(db, 'authenticated', admin)
  const { rows } = await db.query<{ code: string }>(
    'select regler_candidature_logement($1,true) as code',
    [id],
  )
  expect(rows[0]!.code).not.toBe(code)
  await devenir(db, 'serveur')
  expect((await db.query('select * from logement_par_code($1)', [code])).rows).toEqual([])
  expect((await db.query('select * from logement_par_code($1)', [rows[0]!.code])).rows).toEqual([
    {
      libelle: 'T2 Gerland',
      loyer_cents: 78000,
      agence: 'Logis',
      ville: null,
      surface_m2: null,
      pieces: null,
      meuble: null,
      disponible_le: null,
    },
  ])
  await devenir(db, 'authenticated', admin)
  // La description du bien (0072) sort sur la page publique, et rien d'autre.
  await db.query(
    "update logements set ville='Lyon 7e', surface_m2=42, pieces=2, meuble=false, disponible_le='2026-12-01' where id=$1",
    [id],
  )
  await refus('update logements set agence_id=$1 where id=$2', [admin, id])
  await devenir(db, 'serveur')
  expect(
    (await db.query('select * from logement_par_code($1)', [rows[0]!.code])).rows[0],
  ).toMatchObject({ ville: 'Lyon 7e', surface_m2: 42, pieces: 2, meuble: false })
  await devenir(db, 'authenticated', admin)
  await refus("update logements set ville='' where id=$1", [id])
  await refus('update logements set surface_m2=2 where id=$1', [id])
  expect(
    (await db.query('select regler_candidature_logement($1,false) as code', [id])).rows,
  ).toEqual([{ code: null }])
  const second = (await logementOuvert(true)).id
  await redevenirProprietaire(db)
  expect(
    (await db.query('select code_candidature from logements where id=$1', [second])).rows,
  ).toEqual([{ code_candidature: null }])
  await devenir(db, 'authenticated', admin)
  await refus('select regler_candidature_logement($1,true)', [second])
})

test("une autre agence ne regle pas le lien, et personne n'ecrit le code directement", async () => {
  const { id } = await logementOuvert()
  await devenir(db, 'authenticated', intrus)
  await refus('select regler_candidature_logement($1,true)', [id])
  await devenir(db, 'authenticated', admin)
  await refus("update logements set code_candidature=repeat('a',32) where id=$1", [id])
  await devenir(db, 'anon')
  await refus("select * from logement_par_code(repeat('a',32))")
})

test('le locataire rattache son dossier libre au logement, et seulement au sien', async () => {
  const { id, code } = await logementOuvert()
  const d = await dossierLibre()
  await devenirPorteur(db, d, 'locataire')
  expect((await db.query('select candidater_au_logement($1) as nom', [code])).rows).toEqual([
    { nom: 'Logis' },
  ])
  expect(await rattachement(d)).toEqual({ agence_id: agence, logement_id: id })

  const garant = await dossierLibre()
  await devenirPorteur(db, garant, 'garant')
  await refus('select candidater_au_logement($1)', [code])
  expect(await rattachement(garant)).toEqual({ agence_id: null, logement_id: null })
})

test("un code faux, un logement archive ou une agence non verifiee n'ouvrent rien", async () => {
  const { code } = await logementOuvert()
  const d = await dossierLibre()
  await devenirPorteur(db, d, 'locataire')
  await refus("select candidater_au_logement(repeat('b',32))")
  await refus("select candidater_au_logement('pas un code')")
  await redevenirProprietaire(db)
  await db.query("update agences set statut='suspendue' where id=$1", [agence])
  await devenirPorteur(db, d, 'locataire')
  await refus('select candidater_au_logement($1)', [code])
  await devenir(db, 'serveur')
  expect((await db.query('select * from logement_par_code($1)', [code])).rows).toEqual([])
  expect(await rattachement(d)).toEqual({ agence_id: null, logement_id: null })
})

test("un dossier deja chez une autre agence n'est pas deplace", async () => {
  const { code } = await logementOuvert()
  const d = await dossierLibre({ agence_id: autreAgence })
  await devenirPorteur(db, d, 'locataire')
  await refus('select candidater_au_logement($1)', [code])
  expect(await rattachement(d)).toEqual({ agence_id: autreAgence, logement_id: null })
})

test('le serveur ne rattache qu un dossier tout juste ouvert et sans agence', async () => {
  const { id, code } = await logementOuvert()
  const neuf = await dossierLibre()
  const ancien = await dossierLibre({ cree_le: new Date(Date.now() - 3600_000).toISOString() })
  await devenir(db, 'serveur')
  expect(
    (await db.query('select candidater_dossier_neuf($1,$2) as nom', [neuf, code])).rows,
  ).toEqual([{ nom: 'Logis' }])
  await refus('select candidater_dossier_neuf($1,$2)', [ancien, code])
  expect(await rattachement(neuf)).toEqual({ agence_id: agence, logement_id: id })
  expect(await rattachement(ancien)).toEqual({ agence_id: null, logement_id: null })
  await devenirPorteur(db, neuf, 'locataire')
  await refus('select candidater_dossier_neuf($1,$2)', [neuf, code])
})
