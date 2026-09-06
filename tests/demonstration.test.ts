import { devenirDepot, devenirPorteur, reserverObjetDEssai } from './base'
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * Le dossier de demonstration.
 *
 * Ce que la base doit tenir : il s'ouvre sans verification, il est marque et
 * le reste, il est unique par agence, et il ne rend aucun droit de plus. Le
 * remplissage, lui, passe par les memes chemins qu'un vrai garant, donc par
 * des politiques deja testees ailleurs.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const SAM = '55555555-5555-5555-5555-555555555555'

describe('ouvrir_dossier_de_demonstration', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${MARIE}', 'marie@agence-lyon3.fr', now()),
        ('${SAM}',   'sam@autre-agence.fr',   now())
    `)
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
  })

  async function ouvrir(): Promise<string> {
    const { rows } = await db.query<{ ouvrir_dossier_de_demonstration: string }>(
      `select public.ouvrir_dossier_de_demonstration()`,
    )
    return rows[0]!.ouvrir_dossier_de_demonstration
  }

  test('une agence en decouverte l ouvre, alors qu elle n ouvre rien d autre', async () => {
    await devenir(db, 'authenticated', MARIE)

    // La 0012 la refuse pour un vrai locataire.
    expect(await refus(db, `select public.ouvrir_dossier('locataire@exemple.fr')`)).toContain(
      'pas encore verifiee',
    )

    // Et la demonstration, elle, s'ouvre : c'est tout l'objet de la 0013.
    const id = await ouvrir()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ demonstration: boolean; agence_id: string | null }>(
      'select demonstration, agence_id from public.dossiers where id = $1',
      [id],
    )
    expect(rows[0]!.demonstration).toBe(true)
    expect(rows[0]!.agence_id).not.toBeNull()
  })

  test('une seule par agence : rappeler la fonction rend la meme', async () => {
    await devenir(db, 'authenticated', MARIE)
    const premiere = await ouvrir()
    const seconde = await ouvrir()
    expect(seconde).toBe(premiere)

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.dossiers')).toBe(1)
  })

  test('une autre agence a la sienne, et ne voit pas celle des autres', async () => {
    await devenir(db, 'authenticated', MARIE)
    const deMarie = await ouvrir()

    await devenir(db, 'authenticated', SAM)
    await db.query(`select public.rejoindre_ou_creer_agence('Autre Agence')`)
    const deSam = await ouvrir()
    expect(deSam).not.toBe(deMarie)

    // Sam ne voit que la sienne : la politique de lecture est celle de tous
    // les dossiers, la demonstration n'en a pas d'autre.
    expect(await compter(db, 'public.dossiers')).toBe(1)
  })

  test('le marquage ne s ecrit pas depuis l API', async () => {
    await devenir(db, 'authenticated', MARIE)
    const id = await ouvrir()

    // Ni pour le retirer, ni pour le poser sur un vrai dossier : la colonne
    // n'est accordee en ecriture a personne.
    expect(
      await refus(db, `update public.dossiers set demonstration = false where id = '${id}'`),
    ).toContain('permission denied')
  })

  test('anon et les porteurs de lien n y ont pas acces', async () => {
    await devenir(db, 'anon')
    expect(await refus(db, `select public.ouvrir_dossier_de_demonstration()`)).toContain(
      'permission denied',
    )

    await db.exec('set role porteur_lien')
    expect(await refus(db, `select public.ouvrir_dossier_de_demonstration()`)).toContain(
      'permission denied',
    )
  })

  test('un compte sans agence est refuse', async () => {
    await devenir(db, 'authenticated', SAM)
    expect(await refus(db, `select public.ouvrir_dossier_de_demonstration()`)).toContain(
      'Reserve aux membres',
    )
  })

  test('le remplissage passe par les chemins du garant et du locataire', async () => {
    await devenir(db, 'authenticated', MARIE)
    const id = await ouvrir()

    // Ce que `remplirLaDemonstration` fait, rejoue ici avec les roles qu'il
    // emprunte : si une politique le refusait, c'est ici que ca se verrait.
    await devenirPorteur(db, id, 'locataire')
    await db.query(`update public.dossiers set loyer_cents = 115000 where id = '${id}'`)

    await devenirPorteur(db, id, 'garant')
    await db.query(
      `insert into public.engagements (dossier_id, revenu_net_mensuel_cents) values ('${id}', 380000)`,
    )
    await devenirDepot(db, id)
    for (const nature of [
      'bulletin_paie',
      'avis_imposition',
      'piece_identite',
      'justificatif_domicile',
    ]) {
      await reserverObjetDEssai(db, id, `${id}/${nature}`)
      await db.query(
        `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
         values ('${id}', '${nature}', '${id}/${nature}', 1024, 'application/pdf')`,
      )
    }

    // Et le ratio de la 0011 fait son travail sur la demonstration comme sur
    // un vrai dossier : 3,30 fois le loyer, complet.
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ statut: string; ratio: string }>(
      `select d.statut, e.ratio::text from public.dossiers d
         join public.engagements e on e.dossier_id = d.id where d.id = $1`,
      [id],
    )
    expect(rows[0]).toEqual({ statut: 'complet', ratio: '3.30' })
  })
})
