import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire } from './base'

/**
 * La colocation (0092) : un groupe de dossiers, un par colocataire. Elle ne
 * relie que des dossiers principaux de la meme agence, pose leur loyer quand
 * le bail est solidaire, et ne dit a un colocataire rien des autres.
 */

let db: PGlite, agence: string, admin: string, autreAgence: string, intrus: string

async function refus(sql: string, params: unknown[] = []) {
  await db.exec('savepoint refus')
  let message: string | null = null
  try {
    await db.query(sql, params)
  } catch (erreur) {
    message = erreur instanceof Error ? erreur.message : String(erreur)
  } finally {
    await db.exec('rollback to savepoint refus')
  }
  if (message === null) throw new Error(`Cette requete aurait du etre refusee : ${sql}`)
  return message
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

async function colocation(etendue = 'part', total = 120000, a = agence) {
  const { rows } = await db.query<{ id: string }>(
    'insert into colocations(agence_id,loyer_total_cents,etendue) values($1,$2,$3) returning id',
    [a, total, etendue],
  )
  return rows[0]!.id
}

async function dossier(locataire: string, colonnes: Record<string, unknown> = {}) {
  const id = randomUUID()
  const tout = { agence_id: agence, ...colonnes }
  const noms = Object.keys(tout)
  await db.query(
    `insert into dossiers(id,email_locataire${noms.map((n) => ',' + n).join('')})
     values($1,$2${noms.map((_, i) => `,$${i + 3}`).join('')})`,
    [id, locataire, ...Object.values(tout)],
  )
  return id
}

async function loyer(id: string) {
  const { rows } = await db.query<{ loyer_cents: string | null }>(
    'select loyer_cents from dossiers where id=$1',
    [id],
  )
  return rows[0]!.loyer_cents == null ? null : Number(rows[0]!.loyer_cents)
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

test('l agence cree sa colocation et y rattache ses dossiers, pas ceux d une autre', async () => {
  const a = await dossier('a@example.invalid')
  const b = await dossier('b@example.invalid')
  const etranger = await dossier('c@example.invalid', { agence_id: autreAgence })

  await devenir(db, 'authenticated', admin)
  const { rows } = await db.query<{ id: string }>(
    `insert into colocations(agence_id,loyer_total_cents,etendue) values($1,120000,'part') returning id`,
    [agence],
  )
  const c = rows[0]!.id
  for (const [id, part] of [
    [a, 70000],
    [b, 50000],
  ] as const) {
    const r = await db.query('update dossiers set colocation_id=$1, loyer_cents=$2 where id=$3', [
      c,
      part,
      id,
    ])
    expect(r.affectedRows).toBe(1)
  }
  // Le dossier d'une autre agence est invisible : zero ligne, sans erreur.
  const hors = await db.query('update dossiers set colocation_id=$1 where id=$2', [c, etranger])
  expect(hors.affectedRows).toBe(0)
  // Creer pour une autre agence est refuse par la politique.
  await refus(`insert into colocations(agence_id,loyer_total_cents) values($1,90000)`, [
    autreAgence,
  ])

  await devenir(db, 'authenticated', intrus)
  expect((await db.query('select id from colocations')).rows).toEqual([])
  await redevenirProprietaire(db)
  expect(await loyer(a)).toBe(70000)
  expect(await loyer(b)).toBe(50000)
})

test('la colocation d une autre agence est refusee meme en proprietaire', async () => {
  const c = await colocation('part', 90000, autreAgence)
  const a = await dossier('a@example.invalid')
  expect(await refus('update dossiers set colocation_id=$1 where id=$2', [c, a])).toMatch(
    /Colocation inconnue/,
  )
})

test('un bail solidaire pose le loyer total sur chaque dossier', async () => {
  const c = await colocation('loyer_entier', 120000)
  const a = await dossier('a@example.invalid', { colocation_id: c })
  const b = await dossier('b@example.invalid', { colocation_id: c, loyer_cents: 40000 })
  expect(await loyer(a)).toBe(120000)
  expect(await loyer(b)).toBe(120000)
  // L'agence elle-meme ne le fait pas diverger.
  await db.query('update dossiers set loyer_cents=10000 where id=$1', [a])
  expect(await loyer(a)).toBe(120000)
})

test('le colocataire ne modifie pas son loyer ; hors colocation il le peut', async () => {
  const c = await colocation('part', 120000)
  const a = await dossier('a@example.invalid', { colocation_id: c, loyer_cents: 60000 })
  const seul = await dossier('seul@example.invalid', { loyer_cents: 60000 })

  await devenirPorteur(db, a, 'locataire')
  expect(await refus('update dossiers set loyer_cents=10000 where id=$1', [a])).toMatch(
    /se regle par l'agence/,
  )
  await devenirPorteur(db, seul, 'locataire')
  const r = await db.query('update dossiers set loyer_cents=10000 where id=$1', [seul])
  expect(r.affectedRows).toBe(1)
  await redevenirProprietaire(db)
  expect(await loyer(a)).toBe(60000)
})

test('ni second garant, ni demonstration, ni dossier parti dans une colocation', async () => {
  const c = await colocation()
  const a = await dossier('a@example.invalid', { colocation_id: c })
  await refus(
    `insert into dossiers(email_locataire,agence_id,dossier_principal,colocation_id)
     values('a@example.invalid',$1,$2,$3)`,
    [agence, a, c],
  )
  await refus(
    `insert into dossiers(email_locataire,agence_id,demonstration,colocation_id)
     values('demo@example.invalid',$1,true,$2)`,
    [agence, c],
  )
  const parti = await dossier('parti@example.invalid', { statut: 'refuse' })
  expect(await refus('update dossiers set colocation_id=$1 where id=$2', [c, parti])).toMatch(
    /ne peut plus rejoindre/,
  )
})

test('pas deux fois la meme adresse, et un colocataire ne garantit pas un autre', async () => {
  const c = await colocation()
  const a = await dossier('a@example.invalid', {
    colocation_id: c,
    email_garant: 'parent@example.invalid',
  })
  expect(
    await refus(`insert into dossiers(email_locataire,agence_id,colocation_id) values($1,$2,$3)`, [
      'a@example.invalid',
      agence,
      c,
    ]),
  ).toMatch(/figure deja/)
  await refus(`insert into dossiers(email_locataire,agence_id,colocation_id) values($1,$2,$3)`, [
    'parent@example.invalid',
    agence,
    c,
  ])
  const b = await dossier('b@example.invalid', { colocation_id: c })
  expect(
    await refus(`update dossiers set email_garant='a@example.invalid' where id=$1`, [b]),
  ).toMatch(/garant d'un autre/)
  // Un colocataire refuse libere son adresse pour son remplacant.
  await db.query(`update dossiers set statut='refuse' where id=$1`, [a])
  await dossier('a@example.invalid', { colocation_id: c })
})

test('huit colocataires au plus, et plus personne apres une signature', async () => {
  const c = await colocation('part', 800000)
  for (let i = 0; i < 8; i++) await dossier(`c${i}@example.invalid`, { colocation_id: c })
  expect(
    await refus(`insert into dossiers(email_locataire,agence_id,colocation_id) values($1,$2,$3)`, [
      'neuf@example.invalid',
      agence,
      c,
    ]),
  ).toMatch(/au plus huit/)

  const signee = await colocation()
  const s = await dossier('s@example.invalid', { colocation_id: signee })
  await db.exec('set session_replication_role = replica')
  await db.query(`update dossiers set statut='signe' where id=$1`, [s])
  await db.exec('set session_replication_role = origin')
  expect(
    await refus(`insert into dossiers(email_locataire,agence_id,colocation_id) values($1,$2,$3)`, [
      'tard@example.invalid',
      agence,
      signee,
    ]),
  ).toMatch(/deja signee/)
})

test('le colocataire et les garants lisent le bail, rien des autres dossiers', async () => {
  const c = await colocation('part', 120000)
  const a = await dossier('a@example.invalid', {
    colocation_id: c,
    loyer_cents: 70000,
    email_garant: 'ga@example.invalid',
  })
  await dossier('b@example.invalid', { colocation_id: c, loyer_cents: 50000 })
  await dossier('parti@example.invalid', { colocation_id: c })
  await db.query(
    `update dossiers set statut='refuse' where email_locataire='parti@example.invalid'`,
  )
  const second = await dossier('a@example.invalid', {
    dossier_principal: a,
    email_garant: 'gb@example.invalid',
  })
  const attendu = [{ colocataires: 2, loyer_total_cents: 120000, etendue: 'part' }]
  const lire = async (id: string, partie: string) => {
    await devenirPorteur(db, id, partie)
    const { rows } = await db.query<{ loyer_total_cents: string }>('select * from ma_colocation()')
    await redevenirProprietaire(db)
    return rows.map((r) => ({ ...r, loyer_total_cents: Number(r.loyer_total_cents) }))
  }
  expect(await lire(a, 'locataire')).toEqual(attendu)
  expect(await lire(a, 'garant')).toEqual(attendu)
  expect(await lire(second, 'garant')).toEqual(attendu)
  expect(await lire(await dossier('seul@example.invalid'), 'locataire')).toEqual([])

  // Le porteur ne lit ni la table, ni les dossiers des autres.
  await devenirPorteur(db, a, 'locataire')
  expect(await refus('select * from colocations')).toMatch(/permission denied/)
  const { rows } = await db.query('select id from dossiers')
  expect(rows).toEqual([{ id: a }])
})

test('seul le porteur de lien appelle ma_colocation', async () => {
  for (const role of ['anon', 'authenticated', 'serveur'] as const) {
    await devenir(db, role)
    expect(await refus('select * from ma_colocation()')).toMatch(/permission denied/)
    await redevenirProprietaire(db)
  }
})

test('la colocation supprimee detache ses dossiers sans les emporter', async () => {
  const c = await colocation()
  const a = await dossier('a@example.invalid', { colocation_id: c })
  await devenir(db, 'authenticated', admin)
  expect((await db.query('delete from colocations where id=$1', [c])).affectedRows).toBe(1)
  await redevenirProprietaire(db)
  const { rows } = await db.query('select colocation_id from dossiers where id=$1', [a])
  expect(rows).toEqual([{ colocation_id: null }])
})
