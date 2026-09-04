import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'

/**
 * La demande d'activation.
 *
 * Ce que la base doit tenir : l'administrateur declare et date, un membre ne
 * peut pas, et personne ne s'active soi-meme. La verification reste ce que la
 * 0002 en a fait, manuelle et hors API.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const LUC = '33333333-3333-3333-3333-333333333333'

const DEMANDE = `
  update public.agences
     set siren = '123456789',
         carte_pro = 'CPI 6901 2026 000 000 001',
         activation_demandee_le = now()
`

describe('demander l activation', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${MARIE}', 'marie@agence-lyon3.fr', now()),
        ('${LUC}',   'luc@agence-lyon3.fr',   now())
    `)
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    await devenir(db, 'authenticated', LUC)
    await db.query(`select public.rejoindre_ou_creer_agence()`)
  })

  async function agence() {
    await redevenirProprietaire(db)
    const { rows } = await db.query<{
      siren: string | null
      statut: string
      demandee: boolean
    }>(`select siren, statut, activation_demandee_le is not null as demandee from public.agences`)
    return rows[0]!
  }

  test('l administrateur declare et date sa demande, sans s activer', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(DEMANDE)

    // Declaree, datee, et toujours en decouverte : c'est la main qui activera.
    expect(await agence()).toEqual({ siren: '123456789', statut: 'decouverte', demandee: true })
  })

  test('un membre ne demande rien : zero ligne, pas d erreur', async () => {
    await devenir(db, 'authenticated', LUC)
    await db.query(DEMANDE)

    // Le refus silencieux de Postgres : la politique n'a selectionne aucune
    // ligne. Il faut le constater sur l'etat, pas sur une exception.
    expect(await agence()).toEqual({ siren: null, statut: 'decouverte', demandee: false })
  })

  test('personne ne s active soi-meme, meme en demandant', async () => {
    await devenir(db, 'authenticated', MARIE)
    expect(
      await refus(db, `update public.agences set statut = 'verifiee', verifiee_le = now()`),
    ).toContain('permission denied')
  })

  test('la demande peut etre refaite : la date suit', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(DEMANDE)
    await redevenirProprietaire(db)
    await db.query(`update public.agences set activation_demandee_le = now() - interval '2 days'`)

    await devenir(db, 'authenticated', MARIE)
    await db.query(DEMANDE)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ recente: boolean }>(
      `select activation_demandee_le > now() - interval '1 minute' as recente from public.agences`,
    )
    expect(rows[0]!.recente).toBe(true)
  })

  test('un SIREN mal forme est refuse par la base, pas seulement par le formulaire', async () => {
    await devenir(db, 'authenticated', MARIE)
    for (const siren of ['12345678', '1234567890', 'ABCDEFGHI']) {
      expect(await refus(db, `update public.agences set siren = '${siren}'`)).toContain(
        'agences_siren_check',
      )
    }
  })

  test('activer a la main, puis redeclarer, remet en attente', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(DEMANDE)

    // Ce que tu feras depuis le tableau de bord, en une instruction puisque
    // le SIREN ne change pas.
    await redevenirProprietaire(db)
    await db.query(`update public.agences set statut = 'verifiee', verifiee_le = now()`)
    expect((await agence()).statut).toBe('verifiee')

    // Le declencheur de la 0002 : un SIREN qui change annule la verification.
    await devenir(db, 'authenticated', MARIE)
    await db.query(`update public.agences set siren = '987654321'`)
    expect((await agence()).statut).toBe('decouverte')
  })
})
