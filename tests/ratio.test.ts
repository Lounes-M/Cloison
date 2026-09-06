import { devenirDepot, devenirPorteur, reserverObjetDEssai } from './base'
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'

/**
 * Le ratio de solvabilite, et ce qu'il fait au statut.
 *
 * La premiere vraie logique metier, donc les premiers tests qui verifient un
 * resultat et pas seulement un refus. Mais les refus restent la moitie du
 * fichier : personne ne saisit un ratio, personne ne pose « complet » a la
 * main, et un dossier parti ne bouge plus.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'

const NATURES = ['bulletin_paie', 'avis_imposition', 'piece_identite', 'justificatif_domicile']

describe('recalcul du dossier', () => {
  let db: PGlite
  let dossier: string

  async function porteur(role: 'locataire' | 'garant') {
    await devenirPorteur(db, dossier, role)
  }

  async function etat() {
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ statut: string; ratio: string | null }>(
      `select d.statut, e.ratio::text as ratio
         from public.dossiers d
         left join public.engagements e on e.dossier_id = d.id
        where d.id = $1`,
      [dossier],
    )
    return rows[0]!
  }

  async function deposerToutesLesPieces() {
    await devenirDepot(db, dossier)
    for (const nature of NATURES) {
      await reserverObjetDEssai(db, dossier, `${dossier}/${nature}`)
      await db.query(
        `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
         values ($1, $2, $3, 1024, 'application/pdf')`,
        [dossier, nature, `${dossier}/${nature}`],
      )
    }
  }

  async function declarerRevenu(cents: number) {
    await porteur('garant')
    await db.query(
      `insert into public.engagements (dossier_id, revenu_net_mensuel_cents) values ($1, $2)
       on conflict (dossier_id) do update set revenu_net_mensuel_cents = excluded.revenu_net_mensuel_cents`,
      [dossier, cents],
    )
  }

  async function saisirLoyer(cents: number) {
    await porteur('locataire')
    await db.query('update public.dossiers set loyer_cents = $1 where id = $2', [cents, dossier])
  }

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at)
      values ('${MARIE}', 'marie@agence-lyon3.fr', now())
    `)
    await devenir(db, 'serveur')
    const { rows } = await db.query<{ ouvrir_dossier: string }>(
      `select public.ouvrir_dossier('locataire@exemple.fr')`,
    )
    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ id: string }>(
      'select id from public.dossiers where reference = $1',
      [rows[0]!.ouvrir_dossier],
    )
    dossier = d[0]!.id
  })

  test('sans loyer ni revenu, rien n est calcule et rien ne bouge', async () => {
    await deposerToutesLesPieces()
    await declarerRevenu(300_000)

    // Il manque le loyer : un ratio sans denominateur n'existe pas.
    expect(await etat()).toEqual({ statut: 'depot_en_cours', ratio: null })
  })

  test('les deux termes et les pieces : complet a trois fois le loyer', async () => {
    await deposerToutesLesPieces()
    await saisirLoyer(100_000)
    await declarerRevenu(300_000)

    expect(await etat()).toEqual({ statut: 'complet', ratio: '3.00' })
  })

  test('en dessous du seuil : ce garant ne convient pas, sans dire pourquoi', async () => {
    await deposerToutesLesPieces()
    await saisirLoyer(100_000)
    await declarerRevenu(299_999)

    // Le statut est tout ce que le locataire apprendra. Le ratio, lui, reste
    // dans `engagements`, qu'il ne lit jamais.
    //
    // Et il vaut 2,99, pas 3,00 : tronque, jamais arrondi. Un arrondi aurait
    // fait passer 2,99999 pour trois fois le loyer, et c'est exactement ce que
    // ce test a attrape la premiere fois.
    expect(await etat()).toEqual({ statut: 'garant_insuffisant', ratio: '2.99' })
  })

  test('le ratio est calcule meme sans les pieces, mais le verdict attend', async () => {
    await saisirLoyer(100_000)
    await declarerRevenu(400_000)

    // Le chiffre existe des que les deux termes sont la ; le statut ne se
    // prononce qu'avec les pieces, qui en sont la preuve.
    expect(await etat()).toEqual({ statut: 'ouvert', ratio: '4.00' })
  })

  test('retirer une piece fait tomber le verdict', async () => {
    await deposerToutesLesPieces()
    await saisirLoyer(100_000)
    await declarerRevenu(400_000)
    expect((await etat()).statut).toBe('complet')

    await porteur('garant')
    await db.query(`delete from public.pieces where type = 'avis_imposition'`)

    expect(await etat()).toEqual({ statut: 'depot_en_cours', ratio: '4.00' })
  })

  test('le seuil est celui de l agence', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    await db.query(`update public.agences set seuil_ratio = 4`)

    await redevenirProprietaire(db)
    await db.query(
      `update public.dossiers set agence_id = (select id from public.agences) where id = $1`,
      [dossier],
    )

    await deposerToutesLesPieces()
    await saisirLoyer(100_000)
    await declarerRevenu(350_000)

    // 3,5 fois le loyer : assez pour le defaut, pas pour cette agence.
    expect(await etat()).toEqual({ statut: 'garant_insuffisant', ratio: '3.50' })
  })

  test('changer le seuil rejuge les dossiers encore ouverts', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)

    await redevenirProprietaire(db)
    await db.query(
      `update public.dossiers set agence_id = (select id from public.agences) where id = $1`,
      [dossier],
    )

    await deposerToutesLesPieces()
    await saisirLoyer(100_000)
    await declarerRevenu(350_000)
    expect((await etat()).statut).toBe('complet')

    await devenir(db, 'authenticated', MARIE)
    await db.query(`update public.agences set seuil_ratio = 4`)
    expect((await etat()).statut).toBe('garant_insuffisant')

    await devenir(db, 'authenticated', MARIE)
    await db.query(`update public.agences set seuil_ratio = 3`)
    expect((await etat()).statut).toBe('complet')
  })

  test('un dossier parti ne bouge plus, quoi qu on y ecrive', async () => {
    await deposerToutesLesPieces()
    await saisirLoyer(100_000)
    await declarerRevenu(400_000)

    await redevenirProprietaire(db)
    await db.query(`update public.dossiers set statut = 'transmis' where id = $1`, [dossier])

    // L'agence decide sur ce qu'elle a vu. Recalculer derriere elle
    // reecrirait l'histoire.
    await expect(declarerRevenu(100)).rejects.toThrow('fige')
    expect((await etat()).statut).toBe('transmis')
  })

  test('personne ne saisit le ratio, personne ne pose le statut', async () => {
    await declarerRevenu(300_000)

    await porteur('garant')
    expect(await refus(db, `update public.engagements set ratio = 9`)).toContain(
      'permission denied',
    )
    expect(await refus(db, `update public.dossiers set statut = 'complet'`)).toContain(
      'permission denied',
    )

    await porteur('locataire')
    expect(await refus(db, `update public.dossiers set statut = 'complet'`)).toContain(
      'permission denied',
    )
  })

  test('le loyer est au locataire, le revenu au garant', async () => {
    // Le garant ne peut pas ecrire le loyer : le droit de colonne existe pour
    // `porteur_lien`, mais la politique ne selectionne aucune ligne pour lui.
    await porteur('garant')
    await db.query('update public.dossiers set loyer_cents = 1 where id = $1', [dossier])
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ loyer_cents: string | null }>(
      'select loyer_cents from public.dossiers where id = $1',
      [dossier],
    )
    expect(rows[0]!.loyer_cents).toBeNull()

    // Et le locataire n'ecrit pas le revenu : il ne voit pas la table.
    await porteur('locataire')
    expect(
      await refus(
        db,
        `insert into public.engagements (dossier_id, revenu_net_mensuel_cents) values ('${dossier}', 1)`,
      ),
    ).toContain('row-level security')
  })

  test('les fonctions de calcul ne sont pas appelables par l API', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await devenir(db, role)
      expect(await refus(db, `select public.recalculer_dossier('${dossier}')`)).toContain(
        'permission denied',
      )
    }
  })
})
