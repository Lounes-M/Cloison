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
 * Le second garant (0067) : un second dossier lie au principal, jugé avec lui.
 *
 * Ce qui compte : le verdict porte sur la somme des revenus seulement quand
 * chacun a tout déposé, le locataire n'a aucun lien sur le second dossier, et
 * l'agence prend, refuse ou clôt le groupe d'un seul geste.
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
  await db.query("insert into agences(id,nom,domaine) values($1,'Duo','duo-garants.invalid')", [
    agence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@duo-garants.invalid',now())",
    [admin],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, admin],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,email_garant,loyer_cents) values($1,$2,'loc@example.invalid','pere@example.invalid',100000)",
    [principal, agence],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

/** Un refus dans la transaction de l'essai, sans l'interrompre. */
async function refus(db: PGlite, sql: string) {
  await db.exec('savepoint refus')
  try {
    return await refusBrut(db, sql)
  } finally {
    await db.exec('rollback to savepoint refus')
  }
}

async function designer(courriel: string) {
  await devenirPorteur(db, principal, 'locataire')
  const { rows } = await db.query<{ dossier: string; jti: string }>(
    'select * from designer_second_garant($1)',
    [courriel],
  )
  await redevenirProprietaire(db)
  return rows[0]!
}

async function deposer(dossier: string) {
  await devenirDepot(db, dossier)
  for (const nature of NATURES) {
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
  await db.query(
    `insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,$2)
     on conflict (dossier_id) do update set revenu_net_mensuel_cents=excluded.revenu_net_mensuel_cents`,
    [dossier, cents],
  )
  await redevenirProprietaire(db)
}

async function statuts(...ids: string[]) {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ id: string; statut: string }>(
    'select id,statut from dossiers where id=any($1::uuid[])',
    [ids],
  )
  return ids.map((id) => rows.find((r) => r.id === id)?.statut)
}

describe('designation', () => {
  test('le locataire designe un second garant : nouveau dossier lie, lien garant emis', async () => {
    const { dossier, jti } = await designer('  Mere@Example.invalid ')
    const { rows } = await db.query(
      'select dossier_principal,agence_id,email_locataire,email_garant,loyer_cents from dossiers where id=$1',
      [dossier],
    )
    expect(rows[0]).toEqual({
      dossier_principal: principal,
      agence_id: agence,
      email_locataire: 'loc@example.invalid',
      email_garant: 'mere@example.invalid',
      loyer_cents: 100000,
    })
    const jetons = await db.query<{ partie: string; jti: string }>(
      'select partie,jti from jetons_actifs where dossier_id=$1',
      [dossier],
    )
    expect(jetons.rows).toEqual([{ partie: 'garant', jti }])
  })

  test('une seconde designation reutilise le dossier et renouvelle le lien', async () => {
    const premier = await designer('mere@example.invalid')
    const second = await designer('mere@example.invalid')
    expect(second.dossier).toBe(premier.dossier)
    expect(second.jti).not.toBe(premier.jti)
    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int n from dossiers where dossier_principal=$1',
      [principal],
    )
    expect(rows[0]!.n).toBe(1)
  })

  test.each([
    ['loc@example.invalid'],
    ['pere@example.invalid'],
    ['pas-une-adresse'],
    [`${'x'.repeat(180)}@example.invalid`],
  ])('refuse %s comme second garant', async (courriel) => {
    await devenirPorteur(db, principal, 'locataire')
    expect(await refus(db, `select * from designer_second_garant('${courriel}')`)).toMatch(
      /Designation refusee/,
    )
  })

  test('sans premier garant, sans agence ou en demonstration, pas de second', async () => {
    for (const reglage of [
      'email_garant=null',
      'agence_id=null',
      'demonstration=true',
      "statut='transmis'",
    ]) {
      await db.exec('savepoint s')
      await db.query(`update dossiers set ${reglage} where id=$1`, [principal])
      await devenirPorteur(db, principal, 'locataire')
      expect(
        await refus(db, "select * from designer_second_garant('mere@example.invalid')"),
      ).toMatch(/Designation refusee|Acces refuse/)
      await redevenirProprietaire(db)
      await db.exec('rollback to savepoint s')
    }
  })

  test('seul le locataire du principal designe ; personne d autre n appelle', async () => {
    await devenirPorteur(db, principal, 'garant')
    expect(await refus(db, "select * from designer_second_garant('mere@example.invalid')")).toMatch(
      /Acces refuse/,
    )
    const { dossier } = await designer('mere@example.invalid')
    await devenirPorteur(db, dossier, 'garant')
    expect(
      await refus(db, "select * from designer_second_garant('tante@example.invalid')"),
    ).toMatch(/Acces refuse/)
    for (const role of ['anon', 'authenticated', 'serveur'] as const) {
      await devenir(db, role, admin)
      expect(await refus(db, "select * from designer_second_garant('x@example.invalid')")).toMatch(
        /permission denied/,
      )
    }
  })

  test('aucun lien de locataire sur le dossier du second', async () => {
    const { dossier } = await designer('mere@example.invalid')
    expect(
      await refus(
        db,
        `insert into jetons_actifs(dossier_id,partie,jti,expire_le) values('${dossier}','locataire',gen_random_uuid(),now()+interval '1 day')`,
      ),
    ).toMatch(/Aucun lien de locataire/)
    const references = await db.query<{ id: string; reference: string }>(
      'select id,reference from dossiers where id=any($1::uuid[])',
      [[principal, dossier]],
    )
    const ref = (id: string) => references.rows.find((r) => r.id === id)!.reference
    await devenir(db, 'serveur')
    const lien = (reference: string) =>
      db.query('select dossier_id from retrouver_lien_locataire($1,$2)', [
        'loc@example.invalid',
        reference,
      ])
    expect((await lien(ref(dossier))).rows).toEqual([])
    expect((await lien(ref(principal))).rows).toEqual([{ dossier_id: principal }])
  })

  test('le locataire lit l adresse de son second garant, et seulement lui', async () => {
    await devenirPorteur(db, principal, 'locataire')
    expect((await db.query('select mon_second_garant() a')).rows[0]).toEqual({ a: null })
    await designer('mere@example.invalid')
    await devenirPorteur(db, principal, 'locataire')
    expect((await db.query('select mon_second_garant() a')).rows[0]).toEqual({
      a: 'mere@example.invalid',
    })
    await devenirPorteur(db, principal, 'garant')
    expect((await db.query('select mon_second_garant() a')).rows[0]).toEqual({ a: null })
  })
})

describe('verdict du groupe', () => {
  test('deux revenus additionnes atteignent le seuil ensemble', async () => {
    const { dossier } = await designer('mere@example.invalid')
    await deposer(principal)
    await declarer(principal, 200000)
    // Le principal seul ne vaut que deux loyers, et le second n'a rien depose.
    expect(await statuts(principal, dossier)).toEqual(['depot_en_cours', 'ouvert'])
    await deposer(dossier)
    await declarer(dossier, 150000)
    expect(await statuts(principal, dossier)).toEqual(['complet', 'complet'])
    const { rows } = await db.query<{ dossier_id: string; ratio: string }>(
      'select dossier_id,ratio::text from engagements where dossier_id=any($1::uuid[]) order by revenu_net_mensuel_cents desc',
      [[principal, dossier]],
    )
    expect(rows.map((r) => r.ratio)).toEqual(['2.00', '1.50'])
  })

  test('la somme sous le seuil donne garant insuffisant aux deux', async () => {
    const { dossier } = await designer('mere@example.invalid')
    await deposer(principal)
    await declarer(principal, 200000)
    await deposer(dossier)
    await declarer(dossier, 50000)
    expect(await statuts(principal, dossier)).toEqual(['garant_insuffisant', 'garant_insuffisant'])
  })

  test('un principal deja complet repasse en depot quand un second est designe', async () => {
    await deposer(principal)
    await declarer(principal, 300000)
    expect(await statuts(principal)).toEqual(['complet'])
    const { dossier } = await designer('mere@example.invalid')
    expect(await statuts(principal, dossier)).toEqual(['depot_en_cours', 'ouvert'])
  })

  test('sans second garant, le verdict est celui d avant', async () => {
    await deposer(principal)
    await declarer(principal, 299999)
    expect(await statuts(principal)).toEqual(['garant_insuffisant'])
  })

  test('le loyer saisi sur le principal se recopie sur le second', async () => {
    const { dossier } = await designer('mere@example.invalid')
    await devenirPorteur(db, principal, 'locataire')
    await db.query('update dossiers set loyer_cents=120000 where id=$1', [principal])
    await redevenirProprietaire(db)
    const { rows } = await db.query('select loyer_cents from dossiers where id=$1', [dossier])
    expect(rows[0]).toEqual({ loyer_cents: 120000 })
    expect(await refus(db, `update dossiers set loyer_cents=90000 where id='${dossier}'`)).toMatch(
      /dossier principal/,
    )
  })
})

describe('decisions de l agence', () => {
  async function groupeComplet() {
    const { dossier } = await designer('mere@example.invalid')
    await deposer(principal)
    await declarer(principal, 200000)
    await deposer(dossier)
    await declarer(dossier, 150000)
    return dossier
  }

  test('prendre l un prend l autre', async () => {
    const second = await groupeComplet()
    await db.query("update dossiers set statut='transmis' where id=$1", [principal])
    expect(await statuts(principal, second)).toEqual(['transmis', 'transmis'])
  })

  test('refuser l un refuse l autre', async () => {
    const second = await groupeComplet()
    await db.query("update dossiers set statut='refuse' where id=$1", [second])
    expect(await statuts(principal, second)).toEqual(['refuse', 'refuse'])
  })

  test('clore le second clot le groupe et previent les trois parties', async () => {
    const second = await groupeComplet()
    const reference = (
      await db.query<{ reference: string }>('select reference from dossiers where id=$1', [second])
    ).rows[0]!.reference
    const principalRef = (
      await db.query<{ reference: string }>('select reference from dossiers where id=$1', [
        principal,
      ])
    ).rows[0]!.reference
    await devenir(db, 'authenticated', admin)
    const { rows } = await db.query<{ r: unknown }>('select clore_dossier($1,$2) r', [
      second,
      reference,
    ])
    expect(rows[0]!.r).toEqual({
      reference: principalRef,
      email_locataire: 'loc@example.invalid',
      email_garant: 'pere@example.invalid',
      email_second_garant: 'mere@example.invalid',
    })
    await redevenirProprietaire(db)
    expect(await statuts(principal, second)).toEqual(['expire', 'expire'])
    const jetons = await db.query<{ n: number }>(
      'select count(*)::int n from jetons_actifs where dossier_id=any($1::uuid[])',
      [[principal, second]],
    )
    expect(jetons.rows[0]!.n).toBe(0)
  })

  test("l agence lit le groupe et la solvabilite commune, pas celle d'une autre agence", async () => {
    const second = await groupeComplet()
    await devenir(db, 'authenticated', admin)
    const { rows } = await db.query('select * from groupe_du_dossier($1)', [principal])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ autre: second, autre_principal: false, ratio_groupe: '3.50' })
    const inverse = await db.query('select * from groupe_du_dossier($1)', [second])
    expect(inverse.rows[0]).toMatchObject({ autre: principal, autre_principal: true })

    await redevenirProprietaire(db)
    const intrus = randomUUID()
    const autreAgence = randomUUID()
    await db.query("insert into agences(id,nom,domaine) values($1,'Autre','autre-duo.invalid')", [
      autreAgence,
    ])
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'x@autre-duo.invalid',now())",
      [intrus],
    )
    await db.query(
      "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
      [autreAgence, intrus],
    )
    await devenir(db, 'authenticated', intrus)
    expect((await db.query('select * from groupe_du_dossier($1)', [principal])).rows).toEqual([])
    await devenirPorteur(db, principal, 'locataire')
    expect(await refus(db, `select * from groupe_du_dossier('${principal}')`)).toMatch(
      /permission denied/,
    )
  })

  test('les notifications du second sont marquees secondaires', async () => {
    const second = await groupeComplet()
    await devenir(db, 'serveur')
    const { rows } = await db.query<{ dossier: { id: string; secondaire: boolean } }>(
      'select dossier from notifications_a_livrer(null)',
    )
    const parDossier = new Map(rows.map((r) => [r.dossier.id, r.dossier.secondaire]))
    expect(parDossier.get(second)).toBe(true)
    expect(parDossier.get(principal)).toBe(false)
  })
})
