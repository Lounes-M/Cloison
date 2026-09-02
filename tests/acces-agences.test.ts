import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, lignesTouchees, redevenirProprietaire, refus } from './base'

/**
 * Le modele d'acces de l'ADR 0002, automatise.
 *
 * Le scenario existait deja dans `supabase/essais/acces-agences.sql`, mais il
 * fallait le lancer a la main et lire sa sortie pour juger. Les memes cas
 * deviennent ici des assertions : la CI dit desormais si une regle a cede,
 * sans que personne ait a relire quinze blocs de resultats.
 *
 * Ce scenario a deja servi une fois : il avait trouve une variable PL/pgSQL
 * homonyme d'une colonne qui rendait `rejoindre_ou_creer_agence` inutilisable.
 * La migration, elle, s'appliquait sans broncher.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const PAUL = '22222222-2222-2222-2222-222222222222'
const JEAN = '33333333-3333-3333-3333-333333333333'
const LEA = '44444444-4444-4444-4444-444444444444'
const SAM = '55555555-5555-5555-5555-555555555555'

const COMPTES = `
  insert into auth.users (id, email, email_confirmed_at) values
    ('${MARIE}', 'marie@agence-lyon3.fr', now()),
    ('${PAUL}',  'paul@agence-lyon3.fr',  now()),
    ('${JEAN}',  'jean@gmail.com',        now()),
    ('${LEA}',   'lea@agence-lyon3.fr',   null),
    ('${SAM}',   'sam@autre-agence.fr',   now())
`

describe("modele d'acces des agences", () => {
  let db: PGlite

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(COMPTES)
  })

  /** Raccourci : la valeur unique renvoyee par un `select`. */
  async function valeur<T>(sql: string): Promise<T> {
    const { rows } = await db.query<Record<string, T>>(sql)
    return Object.values(rows[0] ?? {})[0] as T
  }

  describe("l'inscription", () => {
    test('une adresse professionnelle cree son agence, et son auteur en est admin', async () => {
      await devenir(db, 'authenticated', MARIE)
      expect(await valeur(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)).toBeTruthy()
      expect(await valeur('select role from public.membres_agence')).toBe('admin')
    })

    test('un deuxieme appel ne cree pas de doublon', async () => {
      await devenir(db, 'authenticated', MARIE)
      const premiere = await valeur(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
      const seconde = await valeur(`select public.rejoindre_ou_creer_agence('Autre nom')`)

      expect(seconde).toBe(premiere)
      await redevenirProprietaire(db)
      expect(await compter(db, 'public.agences')).toBe(1)
    })

    test('le domaine est l invitation : un collegue rejoint au lieu de dupliquer', async () => {
      await devenir(db, 'authenticated', MARIE)
      await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)

      await devenir(db, 'authenticated', PAUL)
      expect(await valeur('select public.rejoindre_ou_creer_agence(null)')).toBeTruthy()

      await redevenirProprietaire(db)
      // Le cas que l'ADR 0002 pointe comme a ne pas rater : sans ce mecanisme,
      // une agence de huit personnes produit huit espaces isoles.
      expect(await compter(db, 'public.agences')).toBe(1)
      expect(
        await valeur(`select role from public.membres_agence where utilisateur_id = '${PAUL}'`),
      ).toBe('membre')
    })

    test('une adresse grand public est refusee', async () => {
      await devenir(db, 'authenticated', JEAN)
      await refus(db, `select public.rejoindre_ou_creer_agence('Agence Gmail')`)
    })

    test('une adresse non confirmee est refusee', async () => {
      await devenir(db, 'authenticated', LEA)
      await refus(db, 'select public.rejoindre_ou_creer_agence(null)')
    })
  })

  describe('le cloisonnement entre agences', () => {
    beforeEach(async () => {
      await devenir(db, 'authenticated', MARIE)
      await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
      await devenir(db, 'authenticated', PAUL)
      await db.query('select public.rejoindre_ou_creer_agence(null)')
      await devenir(db, 'authenticated', SAM)
      await db.query(`select public.rejoindre_ou_creer_agence('Autre Agence')`)
    })

    test('un membre ne voit que son agence et ses collegues', async () => {
      await redevenirProprietaire(db)
      expect(await compter(db, 'public.agences')).toBe(2)

      await devenir(db, 'authenticated', SAM)
      expect(await compter(db, 'public.agences')).toBe(1)
      expect(await compter(db, 'public.membres_agence')).toBe(1)

      await devenir(db, 'authenticated', MARIE)
      expect(await compter(db, 'public.agences')).toBe(1)
      // Marie et Paul : les membres voient tous les dossiers de leur agence,
      // le cloisonnement ne passe pas entre collegues.
      expect(await compter(db, 'public.membres_agence')).toBe(2)
    })

    test('un porteur de lien est refuse au niveau des droits', async () => {
      await devenir(db, 'porteur_lien')

      // Le role existe pour le garant et le locataire, et n'a rien a faire du
      // cote agence : aucun droit ne lui est accorde, donc le refus tombe
      // avant meme les politiques.
      expect(await refus(db, 'select * from public.agences')).toContain('permission denied')
      expect(await refus(db, 'select * from public.membres_agence')).toContain('permission denied')
    })
  })

  describe("la verification d'une agence", () => {
    beforeEach(async () => {
      await devenir(db, 'authenticated', MARIE)
      await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
      await devenir(db, 'authenticated', PAUL)
      await db.query('select public.rejoindre_ou_creer_agence(null)')
    })

    test('un admin declare son SIREN mais ne se verifie pas lui-meme', async () => {
      await devenir(db, 'authenticated', MARIE)

      await db.query(`
        update public.agences
        set siren = '552100554', carte_pro = 'CPI 6901 2020 000 012 345'
        where id = public.agence_courante()
      `)
      expect(await valeur('select siren from public.agences')).toBe('552100554')

      // La barriere de l'ADR 0002 : ce qui est controle, c'est le droit
      // d'envoyer un lien a un vrai garant, et il ne s'auto-accorde pas.
      await refus(
        db,
        `update public.agences set statut = 'verifiee' where id = public.agence_courante()`,
      )
      expect(await valeur('select statut from public.agences')).toBe('decouverte')
    })

    test('un membre simple ne modifie rien, et sans erreur', async () => {
      await devenir(db, 'authenticated', PAUL)

      // Aucune erreur levee, aucune ligne touchee : la RLS filtre avant
      // l'ecriture. Un test qui n'observerait que l'absence d'exception
      // passerait ici sans rien verifier.
      expect(
        await lignesTouchees(
          db,
          `update public.agences set nom = 'Detourne' where id = public.agence_courante()`,
        ),
      ).toBe(0)

      await redevenirProprietaire(db)
      expect(await valeur('select nom from public.agences')).toBe('Agence Lyon 3')
    })

    test('un membre ne s ajoute pas a une autre agence', async () => {
      await devenir(db, 'authenticated', PAUL)
      await refus(
        db,
        `insert into public.membres_agence (agence_id, utilisateur_id, role)
         values ((select id from public.agences limit 1), '${PAUL}', 'admin')`,
      )
    })

    test('changer le SIREN fait retomber la verification', async () => {
      await redevenirProprietaire(db)

      // Deux temps, et pas un seul `update` : le declencheur
      // `agence_reinitialise_verification` remet le statut a `decouverte` des
      // que le SIREN bouge. Tout poser d'un coup s'annulerait, ce qui est
      // exactement le comportement qu'on vient verifier plus bas.
      await db.query(`
        update public.agences set siren = '552100554', carte_pro = 'CPI 6901 2020 000 012 345'
        where domaine = 'agence-lyon3.fr'
      `)
      await db.query(`
        update public.agences set statut = 'verifiee', verifiee_le = now()
        where domaine = 'agence-lyon3.fr'
      `)
      expect(await valeur('select statut from public.agences')).toBe('verifiee')

      await devenir(db, 'authenticated', MARIE)
      await db.query(
        `update public.agences set siren = '999999999' where id = public.agence_courante()`,
      )

      await redevenirProprietaire(db)
      // Une agence verifiee qui change d'identite legale redevient non
      // verifiee : sinon la verification porterait sur des informations qui
      // ne sont plus les siennes.
      expect(await valeur('select statut from public.agences')).toBe('decouverte')
      expect(await valeur('select verifiee_le is null from public.agences')).toBe(true)
    })
  })
})
