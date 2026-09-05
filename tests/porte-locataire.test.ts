import { devenirPorteur } from './base'
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * La porte du locataire : ouvrir un dossier et recevoir son premier lien.
 *
 * Le trou que cette fonction bouche : `ouvrir_dossier` rend la reference,
 * `emettre_jeton` veut l'uuid, et `anon` ne lit pas `dossiers`. Sans elle, le
 * serveur ouvrait un dossier que personne ne pourrait jamais rejoindre.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'

type Ouverture = { dossier_id: string; reference: string; jti: string; expire_le: string }

async function ouvrir(db: PGlite, email: string, duree = '7 days'): Promise<Ouverture> {
  const { rows } = await db.query<Ouverture>(
    `select * from public.ouvrir_dossier_avec_lien($1, $2::interval)`,
    [email, duree],
  )
  return rows[0]!
}

describe('ouvrir_dossier_avec_lien', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at)
      values ('${MARIE}', 'marie@agence-lyon3.fr', now())
    `)
    await devenir(db, 'serveur')
  })

  test('le serveur ouvre et recoit de quoi signer le premier lien', async () => {
    const ouvert = await ouvrir(db, 'locataire@exemple.fr')

    expect(ouvert.dossier_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(ouvert.reference.length).toBeGreaterThanOrEqual(8)
    expect(ouvert.jti).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Date(ouvert.expire_le).getTime()).toBeGreaterThan(Date.now())
  })

  test('le dossier existe, et le jeton est bien celui qui vaut', async () => {
    const ouvert = await ouvrir(db, 'locataire@exemple.fr')

    // Le serveur peut verifier un jeton : c'est ce que fait `resoudreCapacite`.
    const { rows } = await db.query<{ jeton_est_actif: boolean }>(
      `select public.jeton_est_actif($1, 'locataire', $2)`,
      [ouvert.dossier_id, ouvert.jti],
    )
    expect(rows[0]!.jeton_est_actif).toBe(true)

    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ reference: string; email_locataire: string }>(
      'select reference, email_locataire from public.dossiers where id = $1',
      [ouvert.dossier_id],
    )
    expect(d[0]).toEqual({ reference: ouvert.reference, email_locataire: 'locataire@exemple.fr' })
  })

  test('le lien ne survit pas au dossier', async () => {
    // Le dossier vide expire a trente jours ; un lien demande pour plus long
    // est borne a cette date, comme `emettre_jeton` le fait deja.
    const ouvert = await ouvrir(db, 'locataire@exemple.fr', '90 days')

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ expire_le: string }>(
      'select expire_le from public.dossiers where id = $1',
      [ouvert.dossier_id],
    )
    expect(new Date(ouvert.expire_le).getTime()).toBeLessThanOrEqual(
      new Date(rows[0]!.expire_le).getTime(),
    )
  })

  test('avec ce jeton, le locataire lit son dossier et rien de plus', async () => {
    const ouvert = await ouvrir(db, 'locataire@exemple.fr')

    await devenirPorteur(db, ouvert.dossier_id, 'locataire')

    // Ce que la page `/locataire` demande, et ce qu'elle obtient.
    const { rows } = await db.query<{ statut: string; reference: string }>(
      'select statut, reference from public.dossiers',
    )
    expect(rows).toEqual([{ statut: 'ouvert', reference: ouvert.reference }])

    // Et ce qu'elle ne pourrait pas obtenir meme en le demandant.
    expect(await compter(db, 'public.engagements')).toBe(0)
    expect(await compter(db, 'public.pieces')).toBe(0)
  })

  test('une adresse sans arobase est refusee, et rien n est cree', async () => {
    await refus(db, `select * from public.ouvrir_dossier_avec_lien('pas-une-adresse', '7 days')`)

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.dossiers')).toBe(0)
    expect(await compter(db, 'public.jetons_actifs')).toBe(0)
  })

  test('deux ouvertures font deux dossiers, pas un', async () => {
    // Comportement assume pour l'instant : la porte ne retrouve pas un dossier
    // existant. « Retrouver mon dossier » est un parcours a part, qui devra
    // repondre la meme chose que l'adresse ait un dossier ou non.
    await ouvrir(db, 'locataire@exemple.fr')
    await ouvrir(db, 'locataire@exemple.fr')

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.dossiers')).toBe(2)
  })

  test('une agence verifiee qui ouvre se voit rattacher le dossier', async () => {
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)

    // Verifiee, en deux instructions : la 0002 remet en `decouverte` toute
    // agence dont le SIREN change, et la 0012 refuse aux non verifiees.
    await redevenirProprietaire(db)
    await db.query(`update public.agences set siren = '123456789', carte_pro = 'CPI 6901 2026 1'`)
    await db.query(`update public.agences set statut = 'verifiee', verifiee_le = now()`)

    await devenir(db, 'authenticated', MARIE)
    const ouvert = await ouvrir(db, 'locataire@exemple.fr')

    // La regle de `ouvrir_dossier` s'applique sans avoir ete recopiee : c'est
    // tout l'interet de l'appeler plutot que de refaire l'insertion.
    const { rows } = await db.query<{ agence_id: string | null }>(
      'select agence_id from public.dossiers where id = $1',
      [ouvert.dossier_id],
    )
    expect(rows[0]!.agence_id).not.toBeNull()
  })

  test('un porteur de lien n ouvre pas de dossier', async () => {
    await db.exec('set role porteur_lien')
    expect(
      await refus(db, `select * from public.ouvrir_dossier_avec_lien('x@exemple.fr', '7 days')`),
    ).toContain('permission denied')
  })
})
