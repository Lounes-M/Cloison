import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * La barriere de l'ADR 0002 : « ce qui est controle, c'est le droit d'envoyer
 * un lien a un vrai garant ». Jusqu'a la migration 0012, rien en base ne
 * l'empechait. Ces tests verifient qu'elle existe, et qu'elle ne touche pas
 * la porte du locataire.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'

describe('ouvrir un dossier selon la verification', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at)
      values ('${MARIE}', 'marie@agence-lyon3.fr', now())
    `)
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
  })

  test('une agence en decouverte n ouvre pas de dossier', async () => {
    await devenir(db, 'authenticated', MARIE)
    const message = await refus(db, `select public.ouvrir_dossier('locataire@exemple.fr')`)
    expect(message).toContain('verifiee')

    // Et la porte avec lien herite du refus sans qu'on ait rien ajoute.
    expect(
      await refus(
        db,
        `select * from public.ouvrir_dossier_avec_lien('locataire@exemple.fr', '7 days')`,
      ),
    ).toContain('verifiee')

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.dossiers')).toBe(0)
  })

  test('une agence verifiee ouvre, et le dossier lui est rattache', async () => {
    await redevenirProprietaire(db)
    // Deux instructions, et ce n'est pas une maladresse : le declencheur de
    // la 0002 remet l'agence en `decouverte` des que le SIREN change, y compris
    // dans l'instruction qui pose `verifiee`. Declarer d'abord, verifier ensuite,
    // exactement comme le fera la main pendant le pilote.
    await db.query(`
      update public.agences
         set siren = '123456789', carte_pro = 'CPI 6901 2026 000 000 001'
    `)
    await db.query(`update public.agences set statut = 'verifiee', verifiee_le = now()`)

    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.ouvrir_dossier('locataire@exemple.fr')`)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ agence_id: string | null }>(
      'select agence_id from public.dossiers',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.agence_id).not.toBeNull()
  })

  test('une agence suspendue est refusee comme une non verifiee', async () => {
    await redevenirProprietaire(db)
    await db.query(`update public.agences set statut = 'suspendue'`)

    await devenir(db, 'authenticated', MARIE)
    expect(await refus(db, `select public.ouvrir_dossier('locataire@exemple.fr')`)).toContain(
      'verifiee',
    )
  })

  test('le locataire, lui, ouvre toujours sans agence', async () => {
    // La porte principale ne depend d'aucune verification : personne ne
    // collecte les pieces de qui que ce soit en ouvrant pour soi-meme.
    await devenir(db, 'serveur')
    await db.query(`select public.ouvrir_dossier('locataire@exemple.fr')`)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ agence_id: string | null }>(
      'select agence_id from public.dossiers',
    )
    expect(rows[0]!.agence_id).toBeNull()
  })

  test('redeclarer son SIREN retire le droit, comme la 0002 le voulait', async () => {
    await redevenirProprietaire(db)
    // Deux instructions, et ce n'est pas une maladresse : le declencheur de
    // la 0002 remet l'agence en `decouverte` des que le SIREN change, y compris
    // dans l'instruction qui pose `verifiee`. Declarer d'abord, verifier ensuite,
    // exactement comme le fera la main pendant le pilote.
    await db.query(`
      update public.agences
         set siren = '123456789', carte_pro = 'CPI 6901 2026 000 000 001'
    `)
    await db.query(`update public.agences set statut = 'verifiee', verifiee_le = now()`)

    // Le declencheur de la 0002 remet l'agence en decouverte : la barriere
    // suit sans qu'on ait rien a lui dire.
    await devenir(db, 'authenticated', MARIE)
    await db.query(`update public.agences set siren = '987654321'`)
    expect(await refus(db, `select public.ouvrir_dossier('locataire@exemple.fr')`)).toContain(
      'verifiee',
    )
  })
})
