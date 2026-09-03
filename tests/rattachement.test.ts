import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { interpreterRattachement } from '@/lib/agences/rattachement'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'

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

  test('le suivant rejoint sans nommer quoi que ce soit', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)

    // L'ecran ne lui demande rien, et c'est la base qui le justifie : appele
    // sans nom, l'appel reussit.
    await devenir(db, 'authenticated', COLLEGUE)
    await db.query(`select public.rejoindre_ou_creer_agence()`)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ role: string; n: number }>(`
      select m.role, count(*) over ()::int as n
        from public.membres_agence m
       where m.utilisateur_id = '${COLLEGUE}'
    `)
    expect(rows[0]!.role).toBe('membre')

    const { rows: agences } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.agences',
    )
    // Une seule agence pour deux personnes du meme domaine : c'est tout
    // l'interet du rattachement, sans quoi une agence de huit personnes
    // produirait huit espaces isoles.
    expect(agences[0]!.n).toBe(1)
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

  test('une reponse vide sans erreur reste une panne', () => {
    // Le cas qu'on oublie : pas d'erreur, mais rien non plus. Le traiter comme
    // un succes donnerait un espace sans agence.
    for (const data of [null, undefined, '', 0, {}, []]) {
      expect(interpreterRattachement(data, null).etat).toBe('panne')
    }
  })
})
