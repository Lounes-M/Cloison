import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { interpreterRattachement } from '@/lib/agences/rattachement'
import { baseDEssai, devenir, redevenirProprietaire, refus, rejoindreAvecAccord } from './base'

/**
 * Le rattachement d'un collaborateur a son agence.
 *
 * Deux moities, verifiees separement parce qu'elles se trompent differemment.
 *
 * La base decide qui rejoint quoi, et cela s'eprouve dans PGlite. Le code, lui,
 * ne fait que traduire des codes SQLSTATE en ecrans, et c'est la que se cache
 * l'erreur silencieuse : une comparaison mal ecrite ferait dire « reessaie
 * dans un instant » a quelqu'un qui doit changer d'adresse, sans qu'aucun test
 * de la base ne s'en apercoive.
 *
 * Les deux moities se rejoignent sur une affirmation : les codes cites dans
 * `lib/agences/rattachement.ts` sont bien ceux que la migration emet. Un test
 * les compare, plutot que de les tenir pour acquis.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const PERSO = '22222222-2222-2222-2222-222222222222'
const COLLEGUE = '33333333-3333-3333-3333-333333333333'

describe('ce que la base decide', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${MARIE}',    'marie@agence-lyon3.fr', now()),
        ('${COLLEGUE}', 'luc@agence-lyon3.fr',   now()),
        ('${PERSO}',    'marie@gmail.com',       now())
    `)
  })

  test('le premier arrive nomme son agence et l administre', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ nom: string; domaine: string; role: string }>(`
      select a.nom, a.domaine, m.role
        from public.agences a
        join public.membres_agence m on m.agence_id = a.id
       where m.utilisateur_id = '${MARIE}'
    `)
    expect(rows[0]).toEqual({
      nom: 'Agence Lyon 3',
      domaine: 'agence-lyon3.fr',
      role: 'admin',
    })
  })

  test('le suivant demande sans nommer quoi que ce soit, et n entre pas seul', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)

    // L'ecran ne lui demande pas de nom, et c'est la base qui le justifie :
    // appele sans nom, l'appel reussit. Mais depuis la 0064 il rend `null` :
    // la demande est deposee, aucun dossier n'est ouvert.
    await devenir(db, 'authenticated', COLLEGUE)
    for (let i = 0; i < 2; i++) {
      const { rows } = await db.query<{ r: string | null }>(
        `select public.rejoindre_ou_creer_agence() as r`,
      )
      expect(rows[0]!.r).toBeNull()
    }
    const { rows: courante } = await db.query<{ a: string | null }>(
      'select public.agence_courante() as a',
    )
    expect(courante[0]!.a).toBeNull()

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ n: number; demandes: number; agences: number }>(`
      select (select count(*)::int from public.membres_agence where utilisateur_id = '${COLLEGUE}') as n,
             (select count(*)::int from public.demandes_rattachement where utilisateur_id = '${COLLEGUE}') as demandes,
             (select count(*)::int from public.agences) as agences
    `)
    // Une seule agence pour deux personnes du meme domaine, une seule demande
    // malgre deux appels, et toujours aucun rattachement.
    expect(rows[0]).toEqual({ n: 0, demandes: 1, agences: 1 })
  })

  test('l accord d un administrateur ouvre l agence a la connexion suivante', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    await rejoindreAvecAccord(db, MARIE, COLLEGUE)

    const { rows } = await db.query<{ a: string | null }>('select public.agence_courante() as a')
    expect(rows[0]!.a).toBeTruthy()

    await redevenirProprietaire(db)
    const { rows: etat } = await db.query<{ role: string; demandes: number; journal: string }>(`
      select (select role from public.membres_agence where utilisateur_id = '${COLLEGUE}') as role,
             (select count(*)::int from public.demandes_rattachement) as demandes,
             (select string_agg(action, ',') from public.journal_administration_agence) as journal
    `)
    expect(etat[0]).toEqual({ role: 'membre', demandes: 0, journal: 'approbation' })
  })

  test('seul un administrateur de cette agence, avec MFA, decide', async () => {
    const AUTRE = '44444444-4444-4444-4444-444444444444'
    const TIERS = '55555555-5555-5555-5555-555555555555'
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${AUTRE}', 'paul@autre-agence.fr', now()),
        ('${TIERS}', 'zoe@agence-lyon3.fr', now())
    `)
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    await devenir(db, 'authenticated', AUTRE)
    await db.query(`select public.rejoindre_ou_creer_agence('Autre agence')`)
    await rejoindreAvecAccord(db, MARIE, COLLEGUE)
    await devenir(db, 'authenticated', TIERS)
    await db.query(`select public.rejoindre_ou_creer_agence()`)

    // Le demandeur ne lit ni n'ecrit la file lui-meme.
    expect(await refus(db, 'select * from public.demandes_rattachement')).toContain(
      'permission denied',
    )
    expect(await refus(db, `select public.decider_rattachement('${TIERS}', true)`)).toContain(
      'Administration refusee',
    )

    // Un membre simple de la meme agence.
    await devenir(db, 'authenticated', COLLEGUE)
    expect(await refus(db, `select public.decider_rattachement('${TIERS}', true)`)).toContain(
      'Administration refusee',
    )
    const { rows: compteMembre } = await db.query<{ n: number }>(
      'select public.rattachements_en_attente() as n',
    )
    expect(compteMembre[0]!.n).toBe(0)

    // L'administrateur d'une autre agence ne trouve pas la demande.
    await devenir(db, 'authenticated', AUTRE)
    const { rows: ailleurs } = await db.query<{ ok: boolean }>(
      `select public.decider_rattachement('${TIERS}', true) as ok`,
    )
    expect(ailleurs[0]!.ok).toBe(false)

    // L'administrateur de l'agence, sans second facteur.
    await db.exec('set role authenticated')
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ role: 'authenticated', sub: MARIE, aal: 'aal1' }),
    ])
    expect(await refus(db, `select public.decider_rattachement('${TIERS}', true)`)).toContain(
      'Administration refusee',
    )

    await devenir(db, 'authenticated', MARIE)
    const { rows: compte } = await db.query<{ n: number }>(
      'select public.rattachements_en_attente() as n',
    )
    expect(compte[0]!.n).toBe(1)
    const { rows: decision } = await db.query<{ ok: boolean }>(
      `select public.decider_rattachement('${TIERS}', true) as ok`,
    )
    expect(decision[0]!.ok).toBe(true)
    // Une demande deja tranchee ne se tranche pas deux fois.
    const { rows: deuxieme } = await db.query<{ ok: boolean }>(
      `select public.decider_rattachement('${TIERS}', false) as ok`,
    )
    expect(deuxieme[0]!.ok).toBe(false)
  })

  test('un refus exclut, et seule la readmission rouvre', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    await devenir(db, 'authenticated', COLLEGUE)
    await db.query(`select public.rejoindre_ou_creer_agence()`)
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.decider_rattachement('${COLLEGUE}', false)`)

    await devenir(db, 'authenticated', COLLEGUE)
    const erreur = await db
      .query(`select public.rejoindre_ou_creer_agence()`)
      .catch((e: { code?: string; message?: string }) => e)
    expect((erreur as { code?: string }).code).toBe('42501')

    // La readmission vaut accord : la connexion suivante rattache directement.
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.readmettre_collaborateur('${COLLEGUE}')`)
    await devenir(db, 'authenticated', COLLEGUE)
    const { rows } = await db.query<{ r: string | null }>(
      `select public.rejoindre_ou_creer_agence() as r`,
    )
    expect(rows[0]!.r).toBeTruthy()

    await redevenirProprietaire(db)
    const { rows: journal } = await db.query<{ actions: string }>(
      "select string_agg(action, ',' order by id) as actions from public.journal_administration_agence",
    )
    expect(journal[0]!.actions).toBe('refus,readmission')
  })

  test('une acceptation ne suit pas une adresse qui change de domaine', async () => {
    const AUTRE = '44444444-4444-4444-4444-444444444444'
    await db.exec(
      `insert into auth.users (id, email, email_confirmed_at) values ('${AUTRE}', 'paul@autre-agence.fr', now())`,
    )
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    await devenir(db, 'authenticated', AUTRE)
    await db.query(`select public.rejoindre_ou_creer_agence('Autre agence')`)
    await devenir(db, 'authenticated', COLLEGUE)
    await db.query(`select public.rejoindre_ou_creer_agence()`)
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.decider_rattachement('${COLLEGUE}', true)`)

    // Avant de se reconnecter, l'adresse passe sur le domaine d'une autre agence.
    await redevenirProprietaire(db)
    await db.query(`update auth.users set email = 'luc@autre-agence.fr' where id = '${COLLEGUE}'`)
    await devenir(db, 'authenticated', COLLEGUE)
    const { rows } = await db.query<{ r: string | null }>(
      `select public.rejoindre_ou_creer_agence() as r`,
    )
    expect(rows[0]!.r).toBeNull()

    await redevenirProprietaire(db)
    const { rows: demande } = await db.query<{ approuvee: boolean; membres: number }>(`
      select d.approuvee_le is not null as approuvee,
             (select count(*)::int from public.membres_agence where utilisateur_id = '${COLLEGUE}') as membres
        from public.demandes_rattachement d where d.utilisateur_id = '${COLLEGUE}'
    `)
    expect(demande[0]).toEqual({ approuvee: false, membres: 0 })
  })

  test('les fournisseurs grand public ajoutes en 0064 ne creent pas d agence', async () => {
    const BOX = '66666666-6666-6666-6666-666666666666'
    await db.exec(
      `insert into auth.users (id, email, email_confirmed_at) values ('${BOX}', 'jean@bbox.fr', now())`,
    )
    await devenir(db, 'authenticated', BOX)
    expect(await refus(db, `select public.rejoindre_ou_creer_agence('Chez moi')`)).toContain(
      'adresse professionnelle',
    )
  })

  test('sans nom et sans agence existante, la base reclame le nom', async () => {
    await devenir(db, 'authenticated', MARIE)
    const message = await refus(db, `select public.rejoindre_ou_creer_agence()`)
    expect(message).toContain("nom de l'agence est requis")
  })

  test('une adresse grand public ne rattache rien', async () => {
    await devenir(db, 'authenticated', PERSO)
    const message = await refus(db, `select public.rejoindre_ou_creer_agence('Chez moi')`)
    expect(message).toContain('adresse professionnelle')
  })

  test('rappeler la fonction ne cree pas de doublon', async () => {
    await devenir(db, 'authenticated', MARIE)
    const { rows: un } = await db.query<{ rejoindre_ou_creer_agence: string }>(
      `select public.rejoindre_ou_creer_agence('Agence Lyon 3')`,
    )
    const { rows: deux } = await db.query<{ rejoindre_ou_creer_agence: string }>(
      `select public.rejoindre_ou_creer_agence()`,
    )

    // La page `/espace` la rejoue a chaque visite : elle doit pouvoir.
    expect(deux[0]!.rejoindre_ou_creer_agence).toBe(un[0]!.rejoindre_ou_creer_agence)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.membres_agence',
    )
    expect(rows[0]!.n).toBe(1)
  })

  test('les codes cites par le code sont bien ceux que la base emet', async () => {
    // L'affirmation qui relie les deux moities de ce fichier. Si la migration
    // changeait de code, l'interpretation continuerait de compiler et
    // l'utilisateur verrait « reessaie » a la place de sa vraie raison.
    await devenir(db, 'authenticated', MARIE)

    const nomManquant = await db
      .query(`select public.rejoindre_ou_creer_agence()`)
      .catch((erreur: { code?: string }) => erreur)
    expect((nomManquant as { code?: string }).code).toBe('22023')

    await devenir(db, 'authenticated', PERSO)
    const domaineRefuse = await db
      .query(`select public.rejoindre_ou_creer_agence('Chez moi')`)
      .catch((erreur: { code?: string }) => erreur)
    expect((domaineRefuse as { code?: string }).code).toBe('42501')
  })
})

describe('ce que le code en fait', () => {
  test('un identifiant rend un rattachement', () => {
    expect(interpreterRattachement('7e0d6f4a-0000-4000-8000-000000000000', null)).toEqual({
      etat: 'rattache',
      agenceId: '7e0d6f4a-0000-4000-8000-000000000000',
    })
  })

  test('le nom manquant demande le nom, et rien d autre', () => {
    expect(interpreterRattachement(null, { code: '22023', message: 'peu importe' })).toEqual({
      etat: 'nom-requis',
    })
  })

  test('un refus garde le message de la base', () => {
    // Le message est deja ecrit pour etre lu par une personne. En tenir une
    // seconde copie ici, c'est garantir qu'elles divergeront.
    expect(
      interpreterRattachement(null, {
        code: '42501',
        message: 'Une adresse professionnelle est requise.',
      }),
    ).toEqual({ etat: 'refus', message: 'Une adresse professionnelle est requise.' })
  })

  test('tout le reste est une panne, jamais un refus deguise', () => {
    for (const erreur of [
      { code: '08006', message: 'connexion perdue' },
      { code: undefined, message: 'inconnue' },
      { message: 'sans code' },
    ]) {
      expect(interpreterRattachement(null, erreur).etat).toBe('panne')
    }
  })

  test('null sans erreur est une demande en attente, et rien d autre', () => {
    // Seule valeur que la 0064 rend pour une demande deposee. Elle ne doit
    // jamais ouvrir un espace.
    expect(interpreterRattachement(null, null)).toEqual({ etat: 'en-attente' })
  })

  test('une reponse vide sans erreur reste une panne', () => {
    // Le cas qu'on oublie : pas d'erreur, mais rien non plus. Le traiter comme
    // un succes donnerait un espace sans agence.
    for (const data of [undefined, '', 0, {}, []]) {
      expect(interpreterRattachement(data, null).etat).toBe('panne')
    }
  })
})
