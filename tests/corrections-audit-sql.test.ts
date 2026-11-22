import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import {
  baseDEssai,
  devenir,
  devenirDepot,
  devenirPorteur,
  redevenirProprietaire,
  refus as refusBrut,
  reserverObjetDEssai,
} from './base'

/**
 * Corrections de l'audit fonctionnel (0084).
 *
 * Ce qui compte : une adresse de garant mal saisie se corrige tant que le
 * garant n'a rien déposé, l'agence corrige un loyer figé et la correction se
 * lit au journal, le locataire retire un second garant resté inactif, et un
 * complément demandé après transmission rouvre le groupe entier.
 */

const NATURES = ['bulletin_paie', 'avis_imposition', 'piece_identite', 'justificatif_domicile']

let db: PGlite, principal: string, admin: string, agence: string

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
  principal = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Audit','audit-agence.invalid')", [
    agence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@audit-agence.invalid',now())",
    [admin],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, admin],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,loyer_cents) values($1,$2,'loc@example.invalid',100000)",
    [principal, agence],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function refus(sql: string) {
  await db.exec('savepoint refus')
  try {
    return await refusBrut(db, sql)
  } finally {
    await db.exec('rollback to savepoint refus')
  }
}

async function designer(courriel: string) {
  await devenirPorteur(db, principal, 'locataire')
  await db.query('select * from designer_garant_avec_lien($1)', [courriel])
  await redevenirProprietaire(db)
}

async function designerSecond(courriel: string) {
  await devenirPorteur(db, principal, 'locataire')
  const { rows } = await db.query<{ dossier: string }>('select * from designer_second_garant($1)', [
    courriel,
  ])
  await redevenirProprietaire(db)
  return rows[0]!.dossier
}

async function deposer(dossier: string, natures = NATURES) {
  await devenirDepot(db, dossier)
  for (const nature of natures) {
    await reserverObjetDEssai(db, dossier, `${dossier}/${nature}`)
    await db.query(
      `insert into pieces(dossier_id,type,chemin,taille_octets,type_reel,nombre_documents)
       values($1,$2,$3,1024,'application/pdf',case when $2='bulletin_paie' then 3 else 1 end)`,
      [dossier, nature, `${dossier}/${nature}`],
    )
  }
  await redevenirProprietaire(db)
}

async function declarer(dossier: string, cents: number) {
  await devenirPorteur(db, dossier, 'garant')
  await db.query('insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,$2)', [
    dossier,
    cents,
  ])
  await redevenirProprietaire(db)
}

async function lire(id: string) {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{
    statut: string
    email_garant: string | null
    loyer_cents: string
    garant_verrouille: boolean
  }>('select statut,email_garant,loyer_cents,garant_verrouille from dossiers where id=$1', [id])
  return rows[0]
}

async function journal(id: string) {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ action: string; acteur: string; acteur_id: string }>(
    'select action,acteur,acteur_id from journal_acces where dossier_id=$1',
    [id],
  )
  return rows
}

describe('adresse du garant', () => {
  test('se corrige tant que le garant n a rien depose, et revoque le premier lien', async () => {
    await designer('pere@exemple.invalid')
    const avant = await db.query<{ jti: string }>(
      "select jti from jetons_actifs where dossier_id=$1 and partie='garant'",
      [principal],
    )
    await designer('pere@example.invalid')
    expect(await lire(principal)).toMatchObject({
      email_garant: 'pere@example.invalid',
      garant_verrouille: false,
    })
    const apres = await db.query<{ jti: string }>(
      "select jti from jetons_actifs where dossier_id=$1 and partie='garant'",
      [principal],
    )
    expect(apres.rows).toHaveLength(1)
    expect(apres.rows[0]!.jti).not.toBe(avant.rows[0]!.jti)
  })

  test('se fige des la premiere piece', async () => {
    await designer('pere@example.invalid')
    await deposer(principal, ['piece_identite'])
    await devenirPorteur(db, principal, 'locataire')
    expect(await refus("select * from designer_garant_avec_lien('autre@example.invalid')")).toMatch(
      /ne peut pas etre remplace/,
    )
  })

  test('se fige des la declaration de revenu', async () => {
    await designer('pere@example.invalid')
    await declarer(principal, 400000)
    await devenirPorteur(db, principal, 'locataire')
    expect(await refus("select * from designer_garant_avec_lien('autre@example.invalid')")).toMatch(
      /ne peut pas etre remplace/,
    )
  })
})

describe('loyer fige', () => {
  beforeEach(async () => {
    await designer('pere@example.invalid')
    await declarer(principal, 400000)
  })

  test('le locataire ne le modifie plus', async () => {
    await devenirPorteur(db, principal, 'locataire')
    expect(await refus(`update dossiers set loyer_cents=50000 where id='${principal}'`)).toMatch(
      /Le loyer est fige/,
    )
  })

  test('l agence le corrige, le verdict suit et la correction est au journal', async () => {
    await deposer(principal)
    expect((await lire(principal))!.statut).toBe('complet')
    await devenir(db, 'authenticated', admin)
    await db.query('update dossiers set loyer_cents=200000 where id=$1', [principal])
    const d = await lire(principal)
    expect(Number(d!.loyer_cents)).toBe(200000)
    expect(d!.statut).toBe('garant_insuffisant')
    expect(await journal(principal)).toContainEqual({
      action: 'loyer_corrige',
      acteur: 'agence',
      acteur_id: admin,
    })
  })

  test('la correction se recopie au second garant deja engage', async () => {
    const second = await designerSecond('mere@example.invalid')
    await declarer(second, 300000)
    await devenirPorteur(db, principal, 'locataire')
    expect(await refus(`update dossiers set loyer_cents=50000 where id='${principal}'`)).toMatch(
      /Le loyer est fige/,
    )
    await devenir(db, 'authenticated', admin)
    await db.query('update dossiers set loyer_cents=120000 where id=$1', [principal])
    expect(Number((await lire(second))!.loyer_cents)).toBe(120000)
  })
})

describe('refus', () => {
  test('le refus de l agence est au journal', async () => {
    await designer('pere@example.invalid')
    await declarer(principal, 400000)
    await deposer(principal)
    await devenir(db, 'authenticated', admin)
    await db.query("update dossiers set statut='refuse' where id=$1", [principal])
    expect(await journal(principal)).toContainEqual({
      action: 'dossier_refuse',
      acteur: 'agence',
      acteur_id: admin,
    })
  })
})

describe('second garant', () => {
  beforeEach(async () => {
    await designer('pere@example.invalid')
    await declarer(principal, 400000)
    await deposer(principal)
  })

  test('le locataire retire un second garant reste inactif et retrouve son verdict', async () => {
    const second = await designerSecond('mere@example.invalid')
    expect((await lire(principal))!.statut).toBe('depot_en_cours')
    await devenirPorteur(db, principal, 'locataire')
    expect((await db.query('select second_garant_libre() libre')).rows[0]).toEqual({ libre: true })
    const { rows } = await db.query<{ ok: boolean }>('select retirer_second_garant() ok')
    expect(rows[0]!.ok).toBe(true)
    expect((await db.query('select second_garant_libre() libre')).rows[0]).toEqual({ libre: false })
    expect(await lire(second)).toBeUndefined()
    expect((await lire(principal))!.statut).toBe('complet')
  })

  test('son adresse se corrige tant qu il n a rien depose', async () => {
    const second = await designerSecond('mere@exemple.invalid')
    expect(await designerSecond('mere@example.invalid')).toBe(second)
    expect((await lire(second))!.email_garant).toBe('mere@example.invalid')
  })

  test('un second garant qui a commence ne se retire plus', async () => {
    const second = await designerSecond('mere@example.invalid')
    await deposer(second, ['piece_identite'])
    await devenirPorteur(db, principal, 'locataire')
    expect((await db.query('select second_garant_libre() libre')).rows[0]).toEqual({ libre: false })
    const { rows } = await db.query<{ ok: boolean }>('select retirer_second_garant() ok')
    expect(rows[0]!.ok).toBe(false)
    expect(await lire(second)).toBeDefined()
  })

  test('le garant et l agence ne retirent rien', async () => {
    await designerSecond('mere@example.invalid')
    await devenirPorteur(db, principal, 'garant')
    expect(await refus('select retirer_second_garant()')).toMatch(/Acces refuse/)
    await devenir(db, 'authenticated', admin)
    expect(await refus('select retirer_second_garant()')).toMatch(/permission denied/)
  })

  test('un complement demande apres transmission rouvre le groupe entier', async () => {
    const second = await designerSecond('mere@example.invalid')
    await declarer(second, 300000)
    await deposer(second)
    await devenir(db, 'authenticated', admin)
    await db.query("update dossiers set statut='transmis' where id=$1", [principal])
    await redevenirProprietaire(db)
    const { rows: pieces } = await db.query<{ id: string }>(
      "select id from pieces where dossier_id=$1 and type='piece_identite'",
      [second],
    )
    expect((await lire(second))!.statut).toBe('transmis')
    await devenir(db, 'authenticated', admin)
    const { rows } = await db.query<{ ok: boolean }>(
      "select demander_complement($1,'illisible') ok",
      [pieces[0]!.id],
    )
    expect(rows[0]!.ok).toBe(true)
    expect((await lire(second))!.statut).toBe('depot_en_cours')
    expect((await lire(principal))!.statut).toBe('depot_en_cours')
  })
})
