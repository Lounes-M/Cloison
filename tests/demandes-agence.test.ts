import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, lignesTouchees, redevenirProprietaire, refus } from './base'

/**
 * La table du formulaire agence (migration 0001).
 *
 * Sa politique tient en une phrase : le role `anon` peut inserer, rien
 * d'autre. C'est ce qui fait que la cle publiable, meme divulguee, ne donne
 * pas la liste des agences prospectees. Cette promesse figure dans l'ADR 0001
 * et dans `.env.example` : elle merite un test qui la tienne.
 */

const DEMANDE = `
  insert into public.demandes_agence (nom_agence, email, ville, dossiers_par_an)
  values ('Agence Bellevue', 'contact@bellevue.fr', 'Lyon', '10-50')
`

describe('demandes_agence', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await baseDEssai()
  })

  test('le serveur depose une demande', async () => {
    await devenir(db, 'serveur')
    await db.query(DEMANDE)

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.demandes_agence')).toBe(1)
  })

  test('anon ne lit pas la liste, meme celle qu il vient d ecrire', async () => {
    await devenir(db, 'serveur')
    await db.query(DEMANDE)

    await devenir(db, 'anon')
    // Le cas qui compte : la cle publiable est cote serveur aujourd'hui, mais
    // sa divulgation ne doit donner aucune lecture.
    expect(await compter(db, 'public.demandes_agence')).toBe(0)
  })

  test('anon ne modifie ni ne supprime, en silence', async () => {
    await devenir(db, 'serveur')
    await db.query(DEMANDE)

    await devenir(db, 'anon')
    // Ces deux requetes ne levent pas : le droit de table existe, c'est la RLS
    // qui filtre. Elles reussissent donc en ne touchant rien, et un test qui
    // n'observerait que l'absence d'exception passerait alors meme que la
    // ligne aurait ete supprimee.
    expect(await lignesTouchees(db, `update public.demandes_agence set statut = 'perdue'`)).toBe(0)
    expect(await lignesTouchees(db, 'delete from public.demandes_agence')).toBe(0)

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.demandes_agence')).toBe(1)
    expect(
      await db
        .query(`select statut from public.demandes_agence`)
        .then((r) => (r.rows[0] as { statut: string }).statut),
    ).toBe('nouvelle')
  })

  test('anon ne contourne pas le formulaire par une insertion directe', async () => {
    await devenir(db, 'anon')
    expect(await refus(db, DEMANDE)).toContain('permission denied')
  })

  test('un porteur de lien est refuse au niveau des droits, pas de la RLS', async () => {
    await devenir(db, 'porteur_lien')

    // Refus bruyant, et c'est plus fort qu'un filtrage a zero ligne : ce role
    // n'a aucun droit sur cette table, la question de la politique ne se pose
    // meme pas.
    expect(await refus(db, 'select * from public.demandes_agence')).toContain('permission denied')
    expect(await refus(db, DEMANDE)).toContain('permission denied')
  })

  test('une meme adresse ne cree pas deux demandes', async () => {
    await devenir(db, 'serveur')
    await db.query(DEMANDE)

    // La casse et les espaces ne doivent pas suffire a contourner l'unicite :
    // l'index porte sur `lower(trim(email))`.
    const message = await refus(
      db,
      `insert into public.demandes_agence (nom_agence, email, ville, dossiers_par_an)
       values ('Bellevue bis', '  CONTACT@Bellevue.FR ', 'Lyon', '10-50')`,
    )
    expect(message).toContain('demandes_agence_email_idx')
  })

  test('un volume inconnu est refuse par la base, pas seulement par Zod', async () => {
    await devenir(db, 'serveur')

    const message = await refus(
      db,
      `insert into public.demandes_agence (nom_agence, email, ville, dossiers_par_an)
       values ('Bellevue', 'autre@bellevue.fr', 'Lyon', 'enormement')`,
    )
    expect(message).toContain('dossiers_par_an')
  })
})
