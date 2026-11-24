import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import {
  baseDEssai,
  devenir,
  devenirDepot,
  devenirPorteur,
  redevenirProprietaire,
  reserverObjetDEssai,
} from './base'

/**
 * La colocation, suite (0094) : la solvabilite mise en commun, ou tous les
 * garants d'un bail solidaire sont juges ensemble, et le garant commun, ou un
 * seul dossier couvre plusieurs colocataires.
 */

const NATURES = ['bulletin_paie', 'avis_imposition', 'piece_identite', 'justificatif_domicile']

let db: PGlite, agence: string, admin: string, intrus: string

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

async function colocation(etendue: string, solvabilite: string, total = 120000) {
  const { rows } = await db.query<{ id: string }>(
    `insert into colocations(agence_id,loyer_total_cents,etendue,solvabilite)
     values($1,$2,$3,$4) returning id`,
    [agence, total, etendue, solvabilite],
  )
  return rows[0]!.id
}

async function dossier(locataire: string, colonnes: Record<string, unknown> = {}) {
  const id = randomUUID()
  const tout = { agence_id: agence, email_garant: `garant-${locataire}`, ...colonnes }
  const noms = Object.keys(tout)
  await db.query(
    `insert into dossiers(id,email_locataire${noms.map((n) => ',' + n).join('')})
     values($1,$2${noms.map((_, i) => `,$${i + 3}`).join('')})`,
    [id, locataire, ...Object.values(tout)],
  )
  return id
}

async function deposer(id: string) {
  await devenirDepot(db, id)
  for (const nature of NATURES) {
    await reserverObjetDEssai(db, id, `${id}/${nature}`)
    await db.query(
      `insert into pieces(dossier_id,type,chemin,taille_octets,type_reel,nombre_documents)
       values($1,$2,$3,1024,'application/pdf',case when $2='bulletin_paie' then 3 else 1 end)`,
      [id, nature, `${id}/${nature}`],
    )
  }
  await redevenirProprietaire(db)
}

async function declarer(id: string, cents: number) {
  await devenirPorteur(db, id, 'garant')
  await db.query(
    `insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,$2)
     on conflict (dossier_id) do update set revenu_net_mensuel_cents=excluded.revenu_net_mensuel_cents`,
    [id, cents],
  )
  await redevenirProprietaire(db)
}

/** Le garant du dossier declare ses revenus et depose toutes ses pieces. */
async function finir(id: string, cents: number) {
  await declarer(id, cents)
  await deposer(id)
}

async function statuts(...ids: string[]) {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ id: string; statut: string }>(
    'select id,statut from dossiers where id=any($1::uuid[])',
    [ids],
  )
  return ids.map((id) => rows.find((r) => r.id === id)?.statut)
}

async function ratioCommun(c: string, qui = admin) {
  await devenir(db, 'authenticated', qui)
  const { rows } = await db.query<{ r: string | null }>('select solvabilite_commune($1) r', [c])
  await redevenirProprietaire(db)
  return rows[0]?.r == null ? null : Number(rows[0].r)
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
  const autre = randomUUID()
  await db.query(
    `insert into agences(id,nom,domaine,siren,carte_pro,statut,verifiee_le) values
       ($1,'Logis','logis.invalid','123456789','CPI recette','verifiee',now()),
       ($2,'Autre','autre-logis.invalid','987654321','CPI recette','verifiee',now())`,
    [agence, autre],
  )
  admin = await membre(agence, 'logis.invalid')
  intrus = await membre(autre, 'autre-logis.invalid')
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

describe('solvabilite mise en commun', () => {
  test('reservee au bail solidaire', async () => {
    expect(
      await refus(
        `insert into colocations(agence_id,loyer_total_cents,etendue,solvabilite)
         values($1,120000,'part','commune')`,
        [agence],
      ),
    ).toMatch(/solvabilite_commune_sur_bail_solidaire/)
  })

  test('le verdict attend tous les garants, puis porte sur la somme des revenus', async () => {
    // Seuil de 3 : il faut 3 600 € a deux pour un loyer de 1 200 €.
    const c = await colocation('loyer_entier', 'commune')
    const a = await dossier('a@example.invalid', { colocation_id: c })
    const b = await dossier('b@example.invalid', { colocation_id: c })

    await finir(a, 200000)
    // Seul, A serait insuffisant : aucun verdict tant que B n'a pas fini.
    expect(await statuts(a, b)).toEqual(['depot_en_cours', 'ouvert'])
    expect(await ratioCommun(c)).toBeNull()

    await declarer(b, 160000)
    expect(await statuts(a, b)).toEqual(['depot_en_cours', 'ouvert'])
    expect(await ratioCommun(c)).toBe(3)
    await deposer(b)
    expect(await statuts(a, b)).toEqual(['complet', 'complet'])

    // Le ratio individuel reste lisible sur chaque dossier.
    const { rows } = await db.query<{ ratio: string }>(
      'select ratio from engagements where dossier_id=any($1::uuid[]) order by ratio',
      [[a, b]],
    )
    expect(rows.map((r) => Number(r.ratio))).toEqual([1.33, 1.66])

    // Un revenu en baisse fait tomber tout le monde.
    await declarer(b, 150000)
    expect(await statuts(a, b)).toEqual(['garant_insuffisant', 'garant_insuffisant'])
  })

  test('en individuel, la meme colocation juge chacun seul', async () => {
    const c = await colocation('loyer_entier', 'individuelle')
    const a = await dossier('a@example.invalid', { colocation_id: c })
    const b = await dossier('b@example.invalid', { colocation_id: c })
    await finir(a, 400000)
    await finir(b, 160000)
    expect(await statuts(a, b)).toEqual(['complet', 'garant_insuffisant'])

    // L'agence passe en commun : 5 600 € pour 1 200 €, tout le monde passe.
    await devenir(db, 'authenticated', admin)
    const r = await db.query(`update colocations set solvabilite='commune' where id=$1`, [c])
    expect(r.affectedRows).toBe(1)
    expect(await statuts(a, b)).toEqual(['complet', 'complet'])
    // Et revient : chacun retrouve son verdict.
    await db.query(`update colocations set solvabilite='individuelle' where id=$1`, [c])
    expect(await statuts(a, b)).toEqual(['complet', 'garant_insuffisant'])
  })

  test('le second garant d un colocataire compte dans la somme', async () => {
    const c = await colocation('loyer_entier', 'commune')
    const a = await dossier('a@example.invalid', { colocation_id: c })
    const b = await dossier('b@example.invalid', { colocation_id: c })
    const second = await dossier('a@example.invalid', {
      dossier_principal: a,
      email_garant: 'mere@example.invalid',
      loyer_cents: 120000,
    })
    await finir(a, 100000)
    await finir(b, 100000)
    // Le second garant n'a pas fini : pas de verdict.
    expect(await statuts(a, b, second)).toEqual(['depot_en_cours', 'depot_en_cours', 'ouvert'])
    await finir(second, 160000)
    expect(await statuts(a, b, second)).toEqual(['complet', 'complet', 'complet'])
  })

  test('un nouveau venu suspend le verdict, un refus le rend', async () => {
    const c = await colocation('loyer_entier', 'commune')
    const a = await dossier('a@example.invalid', { colocation_id: c })
    const b = await dossier('b@example.invalid', { colocation_id: c })
    await finir(a, 200000)
    await finir(b, 200000)
    expect(await statuts(a, b)).toEqual(['complet', 'complet'])

    const n = await dossier('n@example.invalid', { colocation_id: c })
    expect(await statuts(a, b, n)).toEqual(['depot_en_cours', 'depot_en_cours', 'ouvert'])

    await db.query(`update dossiers set statut='refuse' where id=$1`, [n])
    expect(await statuts(a, b)).toEqual(['complet', 'complet'])

    // Le garant de B refuse : A reste seul, avec 2 000 € pour 1 200 €.
    await db.query(`update dossiers set statut='refuse' where id=$1`, [b])
    expect(await statuts(a)).toEqual(['garant_insuffisant'])
  })

  test('un dossier deja pris garde son statut et ses revenus comptent', async () => {
    const c = await colocation('loyer_entier', 'commune')
    const a = await dossier('a@example.invalid', { colocation_id: c })
    const b = await dossier('b@example.invalid', { colocation_id: c })
    await finir(a, 300000)
    await finir(b, 100000)
    await devenir(db, 'authenticated', admin)
    await db.query(`update dossiers set statut='transmis' where id=$1`, [a])
    expect(await statuts(a, b)).toEqual(['transmis', 'complet'])

    // Une decision est prise : le mode ne change plus.
    await devenir(db, 'authenticated', admin)
    expect(
      await refus(`update colocations set solvabilite='individuelle' where id=$1`, [c]),
    ).toMatch(/deja pris/)
    await redevenirProprietaire(db)

    // B change de revenus : il est rejuge avec ceux de A, qui ne bouge pas.
    await declarer(b, 50000)
    expect(await statuts(a, b)).toEqual(['transmis', 'garant_insuffisant'])
    await declarer(b, 60000)
    expect(await statuts(a, b)).toEqual(['transmis', 'complet'])
  })

  test('le dossier qui quitte la colocation est rejuge seul, les autres sans lui', async () => {
    const c = await colocation('loyer_entier', 'commune')
    const a = await dossier('a@example.invalid', { colocation_id: c })
    const b = await dossier('b@example.invalid', { colocation_id: c })
    await finir(a, 400000)
    await finir(b, 100000)
    expect(await statuts(a, b)).toEqual(['complet', 'complet'])
    await db.query('update dossiers set colocation_id=null where id=$1', [a])
    expect(await statuts(a, b)).toEqual(['complet', 'garant_insuffisant'])
  })

  test('une autre agence ne lit pas le ratio commun, ni ne regle le mode', async () => {
    const c = await colocation('loyer_entier', 'commune')
    const a = await dossier('a@example.invalid', { colocation_id: c })
    await declarer(a, 360000)
    expect(await ratioCommun(c)).toBe(3)
    expect(await ratioCommun(c, intrus)).toBeNull()
    await devenir(db, 'authenticated', intrus)
    const r = await db.query(`update colocations set solvabilite='individuelle' where id=$1`, [c])
    expect(r.affectedRows).toBe(0)
    // L'agence ne touche que le mode : le loyer et l'etendue restent hors de portee.
    await devenir(db, 'authenticated', admin)
    expect(await refus(`update colocations set etendue='part' where id=$1`, [c])).toMatch(
      /permission denied/,
    )
    await devenir(db, 'porteur_lien')
    expect(await refus('select solvabilite_commune($1)', [c])).toMatch(/permission denied/)
  })
})

describe('garant commun', () => {
  test('un dossier couvre plusieurs colocataires, dans la limite de huit', async () => {
    const c = await colocation('part', 'individuelle', 240000)
    const a = await dossier('a@example.invalid', { colocation_id: c, loyer_cents: 160000 })
    const b = await dossier('b@example.invalid', { colocation_id: c, loyer_cents: 80000 })

    await devenir(db, 'authenticated', admin)
    const r = await db.query('update dossiers set colocataires_garantis=2 where id=$1', [a])
    expect(r.affectedRows).toBe(1)
    // 2 + 1 = 3 : il reste cinq places, pas sept.
    expect(await refus('update dossiers set colocataires_garantis=7 where id=$1', [b])).toMatch(
      /au plus huit/,
    )
    await db.query('update dossiers set colocataires_garantis=6 where id=$1', [b])
    await redevenirProprietaire(db)
    expect(
      await refus(
        `insert into dossiers(email_locataire,agence_id,colocation_id) values($1,$2,$3)`,
        ['neuf@example.invalid', agence, c],
      ),
    ).toMatch(/au plus huit/)

    // Le colocataire et le garant du dossier commun le savent ; l'autre non.
    const lire = async (id: string, partie: string) => {
      await devenirPorteur(db, id, partie)
      const { rows } = await db.query<{ colocataires: number; garantis: number }>(
        'select colocataires,garantis from ma_colocation()',
      )
      await redevenirProprietaire(db)
      return rows
    }
    expect(await lire(a, 'garant')).toEqual([{ colocataires: 8, garantis: 2 }])
    expect(await lire(b, 'locataire')).toEqual([{ colocataires: 8, garantis: 6 }])
  })

  test('le garant commun est juge sur le loyer que porte son dossier', async () => {
    const c = await colocation('part', 'individuelle', 240000)
    const a = await dossier('a@example.invalid', {
      colocation_id: c,
      loyer_cents: 160000,
      colocataires_garantis: 2,
    })
    await finir(a, 400000)
    expect(await statuts(a)).toEqual(['garant_insuffisant'])
    await declarer(a, 480000)
    expect(await statuts(a)).toEqual(['complet'])
  })

  test('seulement dans une colocation, et jamais sur un second garant', async () => {
    const seul = await dossier('seul@example.invalid')
    expect(await refus('update dossiers set colocataires_garantis=2 where id=$1', [seul])).toMatch(
      /que dans une colocation/,
    )
    const c = await colocation('part', 'individuelle')
    const a = await dossier('a@example.invalid', { colocation_id: c, colocataires_garantis: 2 })
    const second = await dossier('a@example.invalid', {
      dossier_principal: a,
      email_garant: 'mere@example.invalid',
    })
    expect(
      await refus('update dossiers set colocataires_garantis=2 where id=$1', [second]),
    ).toMatch(/que dans une colocation/)
    // Le second garant lit le nombre du dossier principal.
    await devenirPorteur(db, second, 'garant')
    const { rows } = await db.query('select garantis from ma_colocation()')
    expect(rows).toEqual([{ garantis: 2 }])
    await redevenirProprietaire(db)

    // La colocation supprimee : le dossier redevient un dossier seul.
    await db.query('delete from colocations where id=$1', [c])
    const apres = await db.query(
      'select colocation_id,colocataires_garantis from dossiers where id=$1',
      [a],
    )
    expect(apres.rows).toEqual([{ colocation_id: null, colocataires_garantis: 1 }])
  })

  test('fige des que le garant a saisi sa mention, ou que le dossier est pris', async () => {
    const c = await colocation('part', 'individuelle')
    const a = await dossier('a@example.invalid', { colocation_id: c, loyer_cents: 60000 })
    const b = await dossier('b@example.invalid', { colocation_id: c, loyer_cents: 60000 })
    await declarer(a, 300000)
    await db.query('update dossiers set colocataires_garantis=2 where id=$1', [a])
    await db.exec('set session_replication_role = replica')
    await db.query(
      `update engagements set mention=repeat('x',60), mention_saisie_le=now() where dossier_id=$1`,
      [a],
    )
    await db.query(`update dossiers set statut='transmis' where id=$1`, [b])
    await db.exec('set session_replication_role = origin')
    for (const id of [a, b]) {
      expect(await refus('update dossiers set colocataires_garantis=3 where id=$1', [id])).toMatch(
        /ne se modifie plus/,
      )
    }
  })

  test('le colocataire ne regle pas lui-meme le garant commun', async () => {
    const c = await colocation('part', 'individuelle')
    const a = await dossier('a@example.invalid', { colocation_id: c })
    await devenirPorteur(db, a, 'locataire')
    expect(await refus('update dossiers set colocataires_garantis=2 where id=$1', [a])).toMatch(
      /permission denied/,
    )
  })
})
