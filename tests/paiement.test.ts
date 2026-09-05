import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { paiementConfirme } from '@/lib/paiement/stripe'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * Encaisser, sans jamais faire payer le garant.
 *
 * Ce que la base doit tenir : seul le role `serveur` marque un dossier regle ;
 * le lien du garant ne part pas d'un dossier de locataire non regle, et part
 * sans condition d'un dossier d'agence ou de demonstration ; un acte signe
 * cree sa facture tout seul, une fois.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'

describe('ce que la base tient', () => {
  let db: PGlite

  async function ouvrir(email: string): Promise<string> {
    await devenir(db, 'serveur')
    const { rows } = await db.query<{ ouvrir_dossier: string }>(
      `select public.ouvrir_dossier($1)`,
      [email],
    )
    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ id: string }>(
      'select id from public.dossiers where reference = $1',
      [rows[0]!.ouvrir_dossier],
    )
    return d[0]!.id
  }

  async function lienGarant(id: string) {
    await devenir(db, 'serveur')
    return db.query(`select * from public.emettre_jeton($1, 'garant', '7 days')`, [id])
  }

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at)
      values ('${MARIE}', 'marie@agence-lyon3.fr', now())
    `)
  })

  test('le role serveur existe, et seul lui marque un dossier regle', async () => {
    const id = await ouvrir('locataire@exemple.fr')

    for (const role of ['anon', 'authenticated'] as const) {
      await devenir(db, role)
      expect(
        await refus(db, `select public.marquer_dossier_paye('${id}', 'cs_test_123456789')`),
      ).toContain('permission denied')
    }
    await db.exec('set role porteur_lien')
    expect(
      await refus(db, `select public.marquer_dossier_paye('${id}', 'cs_test_123456789')`),
    ).toContain('permission denied')

    await db.exec('set role serveur')
    const { rows } = await db.query<{ marquer_dossier_paye: boolean }>(
      `select public.marquer_dossier_paye('${id}', 'cs_test_123456789')`,
    )
    expect(rows[0]!.marquer_dossier_paye).toBe(true)

    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ regle: boolean; ref: string }>(
      `select paye_le is not null as regle, paiement_ref as ref from public.dossiers where id = $1`,
      [id],
    )
    expect(d[0]).toEqual({ regle: true, ref: 'cs_test_123456789' })
  })

  test('le serveur n a aucun autre droit', async () => {
    await ouvrir('locataire@exemple.fr')
    await db.exec('set role serveur')
    for (const table of [
      'public.dossiers',
      'public.pieces',
      'public.engagements',
      'public.cles_dossier',
    ]) {
      expect(await refus(db, `select * from ${table}`)).toContain('permission denied')
    }
  })

  test('marquer deux fois avec la meme reference est un succes, avec une autre une anomalie', async () => {
    const id = await ouvrir('locataire@exemple.fr')
    await db.exec('set role serveur')
    await db.query(`select public.marquer_dossier_paye('${id}', 'cs_test_123456789')`)

    // Stripe rejoue : meme evenement, meme reference, rien ne casse.
    const { rows } = await db.query<{ marquer_dossier_paye: boolean }>(
      `select public.marquer_dossier_paye('${id}', 'cs_test_123456789')`,
    )
    expect(rows[0]!.marquer_dossier_paye).toBe(true)

    expect(
      await refus(db, `select public.marquer_dossier_paye('${id}', 'cs_test_autre_000000')`),
    ).toContain('deja regle')
  })

  test('pas de lien au garant sans reglement, pour un dossier de locataire', async () => {
    const id = await ouvrir('locataire@exemple.fr')

    await devenir(db, 'serveur')
    expect(
      await refus(db, `select * from public.emettre_jeton('${id}', 'garant', '7 days')`),
    ).toContain('pas encore regle')

    // Le locataire, lui, a toujours son lien : c'est par la qu'il paiera.
    await db.query(`select * from public.emettre_jeton('${id}', 'locataire', '7 days')`)

    await db.exec('set role serveur')
    await db.query(`select public.marquer_dossier_paye('${id}', 'cs_test_123456789')`)

    const { rows } = await lienGarant(id)
    expect(rows).toHaveLength(1)
  })

  test('un dossier d agence n attend rien du locataire', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    await redevenirProprietaire(db)
    await db.query(`update public.agences set siren = '123456789', carte_pro = 'CPI test'`)
    await db.query(`update public.agences set statut = 'verifiee', verifiee_le = now()`)

    await devenir(db, 'authenticated', MARIE)
    const { rows } = await db.query<{ ouvrir_dossier: string }>(
      `select public.ouvrir_dossier('locataire@exemple.fr')`,
    )
    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ id: string }>(
      'select id from public.dossiers where reference = $1',
      [rows[0]!.ouvrir_dossier],
    )

    // Le garant recoit son lien sans que personne ait paye : l'agence paiera
    // l'acte, plus tard.
    const { rows: lien } = await lienGarant(d[0]!.id)
    expect(lien).toHaveLength(1)
  })

  test('une demonstration n attend rien non plus', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    const { rows } = await db.query<{ ouvrir_dossier_de_demonstration: string }>(
      `select public.ouvrir_dossier_de_demonstration()`,
    )
    const { rows: lien } = await lienGarant(rows[0]!.ouvrir_dossier_de_demonstration)
    expect(lien).toHaveLength(1)
  })

  test('un acte signe cree sa facture, une fois, jamais pour une demonstration', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    const { rows: demo } = await db.query<{ ouvrir_dossier_de_demonstration: string }>(
      `select public.ouvrir_dossier_de_demonstration()`,
    )
    const id = await ouvrir('locataire@exemple.fr')

    await redevenirProprietaire(db)
    await db.query(
      `update public.dossiers set agence_id = (select id from public.agences) where id = $1`,
      [id],
    )
    await db.query(`update public.dossiers set statut = 'signe' where id = $1`, [id])
    await db.query(`update public.dossiers set statut = 'signe' where id = $1`, [
      demo[0]!.ouvrir_dossier_de_demonstration,
    ])

    expect(await compter(db, 'public.factures_actes')).toBe(1)
    const { rows } = await db.query<{ montant_cents: number }>(
      'select montant_cents from public.factures_actes',
    )
    expect(rows[0]!.montant_cents).toBe(2900)

    // Rejouer le statut ne refacture pas.
    await db.query(`update public.dossiers set statut = 'signe' where id = $1`, [id])
    expect(await compter(db, 'public.factures_actes')).toBe(1)

    // L'agence lit sa facture ; le garant n'a rien a voir avec.
    await devenir(db, 'authenticated', MARIE)
    expect(await compter(db, 'public.factures_actes')).toBe(1)
    await db.exec('set role porteur_lien')
    expect(await refus(db, 'select * from public.factures_actes')).toContain('permission denied')
  })

  test('un dossier facture ne se purge pas', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    const id = await ouvrir('locataire@exemple.fr')
    await redevenirProprietaire(db)
    await db.query(
      `update public.dossiers set agence_id = (select id from public.agences) where id = $1`,
      [id],
    )
    await db.query(`update public.dossiers set statut = 'signe' where id = $1`, [id])
    await db.query(
      `update public.dossiers set cree_le = now() - interval '4 months', expire_le = now() - interval '1 day' where id = $1`,
      [id],
    )

    // Deux gardes pour la meme regle : le statut `signe` de la 0017, et
    // `on delete restrict` de la facture.
    const { rows } = await db.query<{ purger_les_dossiers_expires: number }>(
      'select public.purger_les_dossiers_expires()',
    )
    expect(rows[0]!.purger_les_dossiers_expires).toBe(0)
    expect(await compter(db, 'public.dossiers')).toBe(1)
  })
})

describe('ce que Stripe nous dit', () => {
  const session = (surcharge: Record<string, unknown>): Record<string, unknown> => ({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123456789',
        payment_status: 'paid',
        client_reference_id: '44444444-4444-4444-4444-444444444444',
        metadata: { dossier_id: '44444444-4444-4444-4444-444444444444' },
        ...surcharge,
      },
    },
  })

  test('une session payee designe son dossier', () => {
    expect(paiementConfirme(session({}) as never)).toEqual({
      dossierId: '44444444-4444-4444-4444-444444444444',
      reference: 'cs_test_123456789',
    })
  })

  test('une session non payee ne marque rien', () => {
    expect(paiementConfirme(session({ payment_status: 'unpaid' }) as never)).toBeNull()
  })

  test('un autre evenement ne marque rien', () => {
    expect(paiementConfirme({ ...session({}), type: 'payment_intent.created' } as never)).toBeNull()
  })

  test('un identifiant de dossier qui n en est pas un est refuse', () => {
    expect(
      paiementConfirme(
        session({ metadata: { dossier_id: 'x' }, client_reference_id: 'y' }) as never,
      ),
    ).toBeNull()
  })
})
