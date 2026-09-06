import { devenirDepot, devenirPorteur, reserverObjetDEssai } from './base'
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, lignesTouchees, redevenirProprietaire, refus } from './base'

/**
 * Le cloisonnement du dossier, table par table.
 *
 * L'ordre des tests suit la promesse, pas le schema : ce qu'on vient verifier
 * n'est pas que les acces autorises fonctionnent, mais que les interdits
 * tiennent. Un test qui ne constate qu'une lecture reussie ne prouve rien du
 * produit.
 *
 * Le piege du fichier : `porteur_lien` est un seul role Postgres pour le
 * garant ET le locataire. Chaque test qui distingue les deux passe donc par le
 * claim `role_partie`, jamais par le role.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const SAM = '55555555-5555-5555-5555-555555555555'

describe('cloisonnement du dossier', () => {
  let db: PGlite
  let dossier: string

  /** Se presenter comme porteur d'un jeton de capacite. */
  async function porteur(role: 'locataire' | 'garant', id = dossier) {
    await devenirPorteur(db, id, role)
  }

  async function id(reference: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.dossiers where reference = $1`,
      [reference],
    )
    return rows[0]!.id
  }

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${MARIE}', 'marie@agence-lyon3.fr', now()),
        ('${SAM}',   'sam@autre-agence.fr',   now())
    `)

    // Un dossier ouvert par un locataire, sans agence : c'est la porte
    // principale du produit.
    await devenir(db, 'serveur')
    const { rows } = await db.query<{ ouvrir_dossier: string }>(
      `select public.ouvrir_dossier('locataire@exemple.fr')`,
    )
    await redevenirProprietaire(db)
    dossier = await id(rows[0]!.ouvrir_dossier)

    await db.query(
      `insert into public.engagements (dossier_id, montant_max_cents, jusqu_au, ratio, calcule_le)
       values ($1, 420000, '2027-06-30', 3.40, now())`,
      [dossier],
    )
    await db.query(
      `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
       values ($1, 'bulletin_paie', $2, 240000, 'application/pdf')`,
      [dossier, `${dossier}/bulletin-1`],
    )
  })

  describe('le locataire', () => {
    test('voit son dossier et son statut', async () => {
      await porteur('locataire')
      expect(await compter(db, 'public.dossiers')).toBe(1)
    })

    test('ne voit AUCUN montant, ni le ratio', async () => {
      await porteur('locataire')

      // Le coeur de la promesse. Ces lignes existent, il ne les voit pas :
      // ce n'est pas un filtrage d'affichage, la base ne les lui rend pas.
      expect(await compter(db, 'public.engagements')).toBe(0)
    })

    test('ne voit AUCUNE piece', async () => {
      await porteur('locataire')
      expect(await compter(db, 'public.pieces')).toBe(0)
    })

    test('ne depose pas de piece a la place du garant', async () => {
      await porteur('locataire')
      // Le chemin et le type sont valides : ce qui refuse est bien la
      // droit INSERT, pas une contrainte de forme.
      expect(
        await refus(
          db,
          `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
           values ('${dossier}', 'avis_imposition', '${dossier}/faux', 1000, 'application/pdf')`,
        ),
      ).toContain('permission denied')
    })

    test('ne declare ni ne supprime l engagement', async () => {
      await porteur('locataire')

      // Aucun droit d'ecriture sur cette table : le refus tombe au niveau des
      // droits, avant meme qu'une politique ait a se prononcer.
      expect(await refus(db, 'delete from public.engagements')).toContain('permission denied')

      // On retire la ligne du prealable en proprietaire, pour que le refus qui
      // suit porte bien sur l'ecriture et non sur la cle primaire.
      await redevenirProprietaire(db)
      await db.query('delete from public.engagements')

      await porteur('locataire')
      expect(
        await refus(
          db,
          `insert into public.engagements (dossier_id, montant_max_cents)
           values ('${dossier}', 1)`,
        ),
      ).toContain('policy')
    })

    test('designe son garant, et rien d autre', async () => {
      await porteur('locataire')

      expect(
        await lignesTouchees(
          db,
          `update public.dossiers set email_garant = 'tonton@exemple.fr' where id = '${dossier}'`,
        ),
      ).toBe(1)

      // Le droit porte sur la seule colonne `email_garant` : toucher au statut
      // est refuse au niveau des droits, avant meme la politique.
      expect(
        await refus(db, `update public.dossiers set statut = 'signe' where id = '${dossier}'`),
      ).toContain('permission denied')
    })

    test('ne voit pas le dossier de quelqu un d autre', async () => {
      await devenir(db, 'serveur')
      const { rows } = await db.query<{ ouvrir_dossier: string }>(
        `select public.ouvrir_dossier('autre@exemple.fr')`,
      )
      await redevenirProprietaire(db)
      const autre = await id(rows[0]!.ouvrir_dossier)

      // Jeton du premier dossier, lecture tentee alors que deux existent.
      await porteur('locataire')
      const { rows: vus } = await db.query<{ id: string }>('select id from public.dossiers')
      expect(vus.map((r) => r.id)).toEqual([dossier])
      expect(vus.map((r) => r.id)).not.toContain(autre)
    })
  })

  describe('le garant', () => {
    test('voit son engagement et ses pieces', async () => {
      await porteur('garant')
      expect(await compter(db, 'public.engagements')).toBe(1)
      expect(await compter(db, 'public.pieces')).toBe(1)
    })

    test('le serveur depose une piece validee pour le garant', async () => {
      await devenirDepot(db, dossier)
      await reserverObjetDEssai(db, dossier, `${dossier}/avis`)
      await db.query(
        `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
         values ('${dossier}', 'avis_imposition', '${dossier}/avis', 90000, 'application/pdf')`,
      )
      expect(await compter(db, 'public.pieces')).toBe(2)
    })

    test('ne fabrique pas directement une metadonnee de piece', async () => {
      await porteur('garant')
      expect(
        await refus(
          db,
          `insert into public.pieces (dossier_id,type,chemin,taille_octets,type_reel)
         values ('${dossier}','avis_imposition','${dossier}/direct',1024,'application/pdf')`,
        ),
      ).toContain('permission denied')
    })

    test('ne depose pas dans le dossier d un autre', async () => {
      await devenir(db, 'serveur')
      const { rows } = await db.query<{ ouvrir_dossier: string }>(
        `select public.ouvrir_dossier('autre@exemple.fr')`,
      )
      await redevenirProprietaire(db)
      const autre = await id(rows[0]!.ouvrir_dossier)

      // Serveur de depot du dossier A, ecriture visee sur le dossier B.
      await devenirDepot(db, dossier)
      await reserverObjetDEssai(db, autre, `${autre}/vol`)
      const insertion = `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
        values ('${autre}', 'bulletin_paie', '${autre}/vol', 1000, 'application/pdf')`
      expect(await refus(db, insertion)).toContain('Reservation indisponible')
      // Isoler ensuite la RLS dans cette base jetable, sans masquer son refus
      // derriere le controle de reservation qui s'execute avant elle.
      await db.exec('reset role; alter table public.pieces disable trigger b_piece_reservation')
      await db.exec('set role depot_piece')
      expect(await refus(db, insertion)).toContain('row-level security')
      await db.exec('reset role; alter table public.pieces enable trigger b_piece_reservation')
    })

    test('ne retire plus une piece une fois le dossier transmis', async () => {
      await redevenirProprietaire(db)
      await db.query(`update public.dossiers set statut = 'transmis' where id = '${dossier}'`)

      await porteur('garant')
      // La decision de l'agence s'appuie sur ces pieces : les retirer
      // reecrirait l'histoire. Refus silencieux, d'ou le comptage.
      expect(await lignesTouchees(db, 'delete from public.pieces')).toBe(0)
      expect(await compter(db, 'public.pieces')).toBe(1)
    })

    test('ne change pas le statut du dossier', async () => {
      await porteur('garant')
      expect(
        await refus(db, `update public.dossiers set statut = 'complet' where id = '${dossier}'`),
      ).toContain('permission denied')
    })
  })

  describe("l'agence", () => {
    beforeEach(async () => {
      await devenir(db, 'authenticated', MARIE)
      await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
      await devenir(db, 'authenticated', SAM)
      await db.query(`select public.rejoindre_ou_creer_agence('Autre Agence')`)

      await redevenirProprietaire(db)
      await db.query(`
        update public.dossiers
           set agence_id = (select id from public.agences where domaine = 'agence-lyon3.fr')
         where id = '${dossier}'
      `)
    })

    test('voit le dossier qui lui est rattache, engagement et pieces compris', async () => {
      await devenir(db, 'authenticated', MARIE)
      expect(await compter(db, 'public.dossiers')).toBe(1)
      expect(await compter(db, 'public.engagements')).toBe(1)
      expect(await compter(db, 'public.pieces')).toBe(1)
    })

    test('ne voit rien du dossier d une autre agence', async () => {
      await devenir(db, 'authenticated', SAM)

      // Le cloisonnement qui compte commercialement : deux agences du pilote
      // ne doivent jamais se croiser.
      expect(await compter(db, 'public.dossiers')).toBe(0)
      expect(await compter(db, 'public.engagements')).toBe(0)
      expect(await compter(db, 'public.pieces')).toBe(0)
    })

    test('fait avancer son dossier mais ne touche pas aux adresses', async () => {
      await devenir(db, 'authenticated', MARIE)

      expect(await refus(db, `update public.dossiers set statut = 'signe'`)).toContain(
        'Transition interdite',
      )

      expect(
        await refus(db, `update public.dossiers set email_locataire = 'pirate@exemple.fr'`),
      ).toContain('permission denied')
    })

    test('ne depose ni ne supprime de piece', async () => {
      await devenir(db, 'authenticated', MARIE)
      expect(
        await refus(
          db,
          `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
           values ('${dossier}', 'bulletin_paie', '${dossier}/ajout', 100, 'application/pdf')`,
        ),
      ).toContain('permission denied')
      expect(await refus(db, 'delete from public.pieces')).toContain('permission denied')
    })
  })

  describe('anon et le serveur', () => {
    test('anon n ouvre plus de dossier, et n en lit aucun', async () => {
      await devenir(db, 'anon')
      // Depuis la 0019, la cle publiable seule ne cree plus rien : ouvrir
      // exige notre signature, portee par le role `serveur`.
      expect(await refus(db, `select public.ouvrir_dossier('encore@exemple.fr')`)).toContain(
        'permission denied',
      )
      expect(await refus(db, 'select * from public.dossiers')).toContain('permission denied')
      expect(await refus(db, 'select * from public.engagements')).toContain('permission denied')
      expect(await refus(db, 'select * from public.pieces')).toContain('permission denied')
    })

    test('le serveur ouvre un dossier mais n en lit aucun', async () => {
      await devenir(db, 'serveur')
      await db.query(`select public.ouvrir_dossier('encore@exemple.fr')`)

      // Le serveur ecrit par la fonction, il ne lit jamais une table.
      expect(await refus(db, 'select * from public.dossiers')).toContain('permission denied')
      expect(await refus(db, 'select * from public.engagements')).toContain('permission denied')
      expect(await refus(db, 'select * from public.pieces')).toContain('permission denied')
    })

    test('ne choisit ni le statut ni la date d expiration', async () => {
      await devenir(db, 'anon')
      // La creation passe par une fonction, pas par un `insert` : c'est ce qui
      // empeche de poser `statut = 'signe'` en ouvrant le dossier.
      expect(
        await refus(
          db,
          `insert into public.dossiers (email_locataire, statut) values ('x@y.fr', 'signe')`,
        ),
      ).toContain('permission denied')
    })
  })

  describe('la retention', () => {
    test('un dossier vide expire en 30 jours', async () => {
      await redevenirProprietaire(db)
      await db.query(`select public.ouvrir_dossier('vide@exemple.fr')`)

      const { rows } = await db.query<{ jours: number }>(`
        select round(extract(epoch from (expire_le - cree_le)) / 86400)::int as jours
          from public.dossiers where email_locataire = 'vide@exemple.fr'
      `)
      expect(rows[0]!.jours).toBe(30)
    })

    test('la premiere piece porte l expiration a trois mois', async () => {
      await redevenirProprietaire(db)
      const { rows } = await db.query<{ jours: number }>(
        `select round(extract(epoch from (expire_le - cree_le)) / 86400)::int as jours
           from public.dossiers where id = $1`,
        [dossier],
      )
      // Le dossier du `beforeEach` a deja une piece : le declencheur a donc
      // repousse l'echeance bien au-dela des trente jours initiaux.
      expect(rows[0]!.jours).toBeGreaterThan(85)
    })

    test('la premiere piece fait aussi passer le statut en depot en cours', async () => {
      await redevenirProprietaire(db)
      const { rows } = await db.query<{ statut: string }>(
        'select statut from public.dossiers where id = $1',
        [dossier],
      )
      expect(rows[0]!.statut).toBe('depot_en_cours')
    })
  })
})
