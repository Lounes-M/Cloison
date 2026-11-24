import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'

/**
 * Les durcissements de la revue de securite de novembre 2026 (0097).
 *
 * Chaque essai rejoue le chemin qui passait avant la migration : un loyer
 * fige change sans trace par l'entree dans une colocation solidaire, un garant
 * commun pose apres la mention, des relances multipliees par le nombre de
 * dossiers ouverts pour une meme adresse, les droits par defaut restes sur
 * `demandes_agence`, et un saut de ligne dans un nom recopie vers l'exploitant.
 */

let db: PGlite, agence: string, admin: string

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

async function colocation(etendue: 'part' | 'loyer_entier', total = 200000) {
  const { rows } = await db.query<{ id: string }>(
    'insert into colocations(agence_id,loyer_total_cents,etendue) values($1,$2,$3) returning id',
    [agence, total, etendue],
  )
  return rows[0]!.id
}

async function lire<T>(sql: string, params: unknown[] = []) {
  await redevenirProprietaire(db)
  return (await db.query<T>(sql, params)).rows
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
  admin = randomUUID()
  await db.query(
    `insert into agences(id,nom,domaine,siren,carte_pro,statut,verifiee_le)
     values($1,'Logis','logis.invalid','123456789','CPI recette','verifiee',now())`,
    [agence],
  )
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
    admin,
    'admin@logis.invalid',
  ])
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, admin],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

describe('le loyer pose par la colocation', () => {
  /** Un dossier et son second garant, loyer fige par la declaration du premier. */
  async function groupeFige() {
    const principal = await dossier('a@example.invalid', {
      email_garant: 'g1@example.invalid',
      loyer_cents: 50000,
    })
    const second = await dossier('a@example.invalid', {
      email_garant: 'g2@example.invalid',
      loyer_cents: 50000,
      dossier_principal: principal,
    })
    await db.query(
      'insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,300000)',
      [principal],
    )
    return { principal, second }
  }

  test('entrer en bail solidaire sans nommer le loyer laisse une trace au journal', async () => {
    const { principal } = await groupeFige()
    const c = await colocation('loyer_entier')

    await devenir(db, 'authenticated', admin)
    // Le loyer n'est pas dans le SET : c'est le declencheur de la 0092 qui
    // l'ecrit. Avant la 0097, aucune ligne `loyer_corrige` n'etait inscrite.
    const r = await db.query('update dossiers set colocation_id=$1 where id=$2', [c, principal])
    expect(r.affectedRows).toBe(1)

    const journal = await lire<{ action: string; acteur_id: string }>(
      "select action,acteur_id from journal_acces where dossier_id=$1 and action='loyer_corrige'",
      [principal],
    )
    expect(journal).toEqual([{ action: 'loyer_corrige', acteur_id: admin }])
  })

  test('le dossier du second garant suit le loyer pose par la colocation', async () => {
    const { principal, second } = await groupeFige()
    const c = await colocation('loyer_entier')

    await devenir(db, 'authenticated', admin)
    await db.query('update dossiers set colocation_id=$1 where id=$2', [c, principal])

    const loyers = await lire<{ id: string; loyer_cents: string }>(
      'select id,loyer_cents from dossiers where id=any($1::uuid[])',
      [[principal, second]],
    )
    expect(loyers.map((l) => Number(l.loyer_cents))).toEqual([200000, 200000])
  })

  test('le ratio est recalcule sur le loyer pose', async () => {
    const { principal } = await groupeFige()
    const c = await colocation('loyer_entier')
    await devenir(db, 'authenticated', admin)
    await db.query('update dossiers set colocation_id=$1 where id=$2', [c, principal])
    const ratio = await lire<{ ratio: string }>(
      'select ratio from engagements where dossier_id=$1',
      [principal],
    )
    expect(Number(ratio[0]!.ratio)).toBe(1.5)
  })

  test('un loyer que la requete ne change pas n inscrit rien', async () => {
    const principal = await dossier('a@example.invalid', {
      email_garant: 'g1@example.invalid',
      loyer_cents: 50000,
    })
    await db.query(
      'insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,300000)',
      [principal],
    )
    const c = await colocation('part')
    await devenir(db, 'authenticated', admin)
    await db.query('update dossiers set colocation_id=$1 where id=$2', [c, principal])
    await db.query('update dossiers set loyer_cents=50000 where id=$1', [principal])
    expect(
      await lire("select 1 from journal_acces where dossier_id=$1 and action='loyer_corrige'", [
        principal,
      ]),
    ).toEqual([])
  })

  test('la correction nommee par l agence reste tracee une seule fois', async () => {
    const principal = await dossier('a@example.invalid', {
      email_garant: 'g1@example.invalid',
      loyer_cents: 50000,
    })
    await db.query(
      'insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,300000)',
      [principal],
    )
    await devenir(db, 'authenticated', admin)
    await db.query('update dossiers set loyer_cents=60000 where id=$1', [principal])
    expect(
      await lire("select 1 from journal_acces where dossier_id=$1 and action='loyer_corrige'", [
        principal,
      ]),
    ).toHaveLength(1)
  })
})

describe('le garant commun apres la mention', () => {
  async function avecMention() {
    const id = await dossier('a@example.invalid', {
      email_garant: 'g1@example.invalid',
      loyer_cents: 50000,
    })
    await db.query(
      'insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,300000)',
      [id],
    )
    await db.query(
      `update engagements set mention=repeat('x',60), mention_saisie_le=now() where dossier_id=$1`,
      [id],
    )
    return id
  }

  test('un dossier n entre pas avec un garant commun une fois la mention saisie', async () => {
    const id = await avecMention()
    const c = await colocation('part')
    await devenir(db, 'authenticated', admin)
    expect(
      await refus('update dossiers set colocation_id=$1, colocataires_garantis=3 where id=$2', [
        c,
        id,
      ]),
    ).toMatch(/garant commun ne se modifie plus/)
    // Seul, il entre : la mention ne nomme que son colocataire.
    const r = await db.query('update dossiers set colocation_id=$1 where id=$2', [c, id])
    expect(r.affectedRows).toBe(1)
  })

  test('sans mention, le garant commun se pose a l entree', async () => {
    const id = await dossier('a@example.invalid', { email_garant: 'g1@example.invalid' })
    const c = await colocation('part')
    await devenir(db, 'authenticated', admin)
    const r = await db.query(
      'update dossiers set colocation_id=$1, colocataires_garantis=3 where id=$2',
      [c, id],
    )
    expect(r.affectedRows).toBe(1)
  })

  test('un dossier qui quitte sa colocation redevient un dossier seul', async () => {
    const c = await colocation('part')
    const id = await dossier('a@example.invalid', {
      email_garant: 'g1@example.invalid',
      colocation_id: c,
      colocataires_garantis: 2,
    })
    await db.query(
      'insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,300000)',
      [id],
    )
    await db.query(
      `update engagements set mention=repeat('x',60), mention_saisie_le=now() where dossier_id=$1`,
      [id],
    )
    await devenir(db, 'authenticated', admin)
    await db.query('update dossiers set colocation_id=null where id=$1', [id])
    const lu = await lire<{ colocataires_garantis: number }>(
      'select colocataires_garantis from dossiers where id=$1',
      [id],
    )
    expect(lu[0]!.colocataires_garantis).toBe(1)
  })
})

describe('les relances du locataire, par destinataire', () => {
  async function libre(adresse: string) {
    const id = randomUUID()
    await db.query('insert into dossiers(id,email_locataire,loyer_cents) values($1,$2,90000)', [
      id,
      adresse,
    ])
    await db.query("update dossiers set activite_rappel_le=now()-interval '4 days' where id=$1", [
      id,
    ])
    return id
  }
  async function programmer() {
    await devenir(db, 'serveur')
    const n = (await db.query<{ n: number }>('select programmer_rappels() n')).rows[0]!.n
    await redevenirProprietaire(db)
    return n
  }
  const relances = async (ids: string[]) =>
    (
      await lire<{ n: number }>(
        "select count(*)::int n from rappels_dossiers where nature='locataire' and dossier_id=any($1::uuid[])",
        [ids],
      )
    )[0]!.n

  test('dix dossiers ouverts pour la meme adresse ne valent qu une relance', async () => {
    const ids: string[] = []
    for (let i = 0; i < 10; i++) ids.push(await libre('Victime@Example.invalid'))
    await programmer()
    expect(await relances(ids)).toBe(1)
    // Le passage suivant ne rattrape pas les neuf autres.
    await programmer()
    expect(await relances(ids)).toBe(1)
  })

  test('trois jours plus tard, une seule relance de plus', async () => {
    const ids = [await libre('victime@example.invalid'), await libre('victime@example.invalid')]
    await programmer()
    await db.query("update rappels_dossiers set cree_le=now()-interval '4 days'")
    await programmer()
    expect(await relances(ids)).toBe(2)
  })

  test('deux adresses distinctes sont relancees chacune', async () => {
    const ids = [await libre('un@example.invalid'), await libre('deux@example.invalid')]
    expect(await programmer()).toBe(2)
    expect(await relances(ids)).toBe(2)
  })

  test('les dossiers d agence gardent leur regle par dossier', async () => {
    await db.query(
      'insert into reglages_rappels(agence_id,relance_jours,echeance_jours) values($1,3,0)',
      [agence],
    )
    const ids: string[] = []
    for (const _ of [1, 2]) {
      const id = await dossier('candidat@example.invalid', { loyer_cents: 90000 })
      await db.query("update dossiers set activite_rappel_le=now()-interval '4 days' where id=$1", [
        id,
      ])
      ids.push(id)
    }
    await programmer()
    expect(await relances(ids)).toBe(2)
  })
})

describe('les demandes d agence', () => {
  test('aucun droit de table ne reste aux roles joignables de l exterieur', async () => {
    const { rows } = await db.query<{ role: string; droit: string }>(
      `select r.role, d.droit from unnest(array['anon','authenticated','porteur_lien','depot_piece','archive_signature']) r(role)
       cross join unnest(array['select','insert','update','delete','truncate','references','trigger']) d(droit)
       where has_table_privilege(r.role,'public.demandes_agence',d.droit)`,
    )
    expect(rows).toEqual([])
  })

  test('la politique d insertion laissee a anon a disparu', async () => {
    const { rows } = await db.query<{ policyname: string; roles: string }>(
      "select policyname, roles::text from pg_policies where tablename='demandes_agence'",
    )
    expect(rows).toEqual([{ policyname: 'Le serveur inscrit une demande', roles: '{serveur}' }])
  })

  test('aucune table applicative ne garde un droit par defaut pour anon', async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind in ('r','v','m','p')
         and (has_table_privilege('anon',c.oid,'select') or has_table_privilege('anon',c.oid,'insert')
           or has_table_privilege('anon',c.oid,'update') or has_table_privilege('anon',c.oid,'delete')
           or has_table_privilege('anon',c.oid,'truncate'))`,
    )
    expect(rows).toEqual([])
  })

  test('aucune table applicative ne laisse TRUNCATE a un role de l API', async () => {
    const { rows } = await db.query<{ relname: string; role: string }>(
      `select c.relname, r.role from pg_class c join pg_namespace n on n.oid=c.relnamespace
       cross join unnest(array['anon','authenticated','porteur_lien','serveur','depot_piece','archive_signature']) r(role)
       where n.nspname='public' and c.relkind in ('r','p') and has_table_privilege(r.role,c.oid,'truncate')`,
    )
    expect(rows).toEqual([])
  })
})

describe('une ligne, pas deux', () => {
  const PIEGE = "Logis\n\nPour activer :\n  update public.agences set statut='verifiee';"

  test('une agence ne se nomme pas avec un saut de ligne', async () => {
    const inconnu = randomUUID()
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
      inconnu,
      'x@nouvelle-agence.invalid',
    ])
    await devenir(db, 'authenticated', inconnu)
    expect(await refus('select public.rejoindre_ou_creer_agence($1)', [PIEGE])).toMatch(
      /agences_nom_sur_une_ligne/,
    )
    const { rows } = await db.query<{ id: string }>(
      "select public.rejoindre_ou_creer_agence('Agence de l''Étoile & Fils') id",
    )
    expect(rows[0]!.id).toBeTruthy()
  })

  test('un administrateur ne renomme pas son agence sur plusieurs lignes', async () => {
    await devenir(db, 'authenticated', admin)
    expect(await refus('update agences set nom=$1 where id=$2', [PIEGE, agence])).toMatch(
      /agences_nom_sur_une_ligne/,
    )
    expect(
      await refus('update agences set carte_pro=$1 where id=$2', ['CPI 7501\n2026', agence]),
    ).toMatch(/agences_carte_pro_sur_une_ligne/)
    // Separateur de ligne Unicode et inversion du sens d'ecriture.
    for (const nom of ['Logis\u2028Suite', 'Logis\u202Esigol']) {
      expect(await refus('update agences set nom=$1 where id=$2', [nom, agence])).toMatch(
        /agences_nom_sur_une_ligne/,
      )
    }
    const r = await db.query("update agences set nom='Logis du Marché' where id=$1", [agence])
    expect(r.affectedRows).toBe(1)
  })

  test('une demande de demonstration tient ses champs sur une ligne', async () => {
    await devenir(db, 'serveur')
    const inserer = (nom: string, email: string, ville: string) =>
      refus(
        `insert into demandes_agence(nom_agence,email,ville,dossiers_par_an) values($1,$2,$3,'10-50')`,
        [nom, email, ville],
      )
    expect(await inserer(PIEGE.slice(0, 100), 'a@bellevue.invalid', 'Lyon')).toMatch(
      /demandes_agence_nom_sur_une_ligne/,
    )
    expect(await inserer('Bellevue', 'a@bellevue.invalid', 'Lyon\nParis')).toMatch(
      /demandes_agence_ville_sur_une_ligne/,
    )
    expect(await inserer('Bellevue', 'a@bellevue.invalid\r\nBcc: x@y.invalid', 'Lyon')).toMatch(
      /demandes_agence_email_sur_une_ligne/,
    )
    await db.query(
      `insert into demandes_agence(nom_agence,email,ville,dossiers_par_an)
       values('Agence Bellevue','contact@bellevue.invalid','Saint-Étienne','10-50')`,
    )
  })
})
