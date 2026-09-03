import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, lignesTouchees, redevenirProprietaire, refus } from './base'

/**
 * Qui peut atteindre la cle scellee d'un dossier.
 *
 * La regle a verifier tient en une phrase : qui voit le dossier voit sa cle
 * scellee, personne d'autre. Et personne, jamais, ne la remplace.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const SAM = '55555555-5555-5555-5555-555555555555'

/** Un tampon de la bonne forme : nonce, marque, puis un peu de chiffre. */
const CLE_SCELLEE = `'\\x${'ab'.repeat(60)}'::bytea`

describe('cles de dossier', () => {
  let db: PGlite
  let dossier: string

  async function porteur(role: 'locataire' | 'garant') {
    await db.exec('set role porteur_lien')
    await db.exec(`set request.jwt.claim.sub = ''`)
    await db.exec(`set request.jwt.claim.dossier_id = '${dossier}'`)
    await db.exec(`set request.jwt.claim.role_partie = '${role}'`)
  }

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${MARIE}', 'marie@agence-lyon3.fr', now()),
        ('${SAM}',   'sam@autre-agence.fr',   now())
    `)

    await devenir(db, 'anon')
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

  test('le garant scelle la cle de son dossier', async () => {
    await porteur('garant')
    await db.query(
      `insert into public.cles_dossier (dossier_id, cle_scellee) values ('${dossier}', ${CLE_SCELLEE})`,
    )
    expect(await compter(db, 'public.cles_dossier')).toBe(1)
  })

  test('le locataire ne voit pas la cle, ni ne la cree', async () => {
    await redevenirProprietaire(db)
    await db.query(
      `insert into public.cles_dossier (dossier_id, cle_scellee) values ('${dossier}', ${CLE_SCELLEE})`,
    )

    await porteur('locataire')
    // Il ne depose rien, il n'a donc aucune raison de toucher a la cle.
    expect(await compter(db, 'public.cles_dossier')).toBe(0)
  })

  test('une agence voit la cle de ses dossiers seulement', async () => {
    await redevenirProprietaire(db)
    await db.query(
      `insert into public.cles_dossier (dossier_id, cle_scellee) values ('${dossier}', ${CLE_SCELLEE})`,
    )

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

    await devenir(db, 'authenticated', MARIE)
    expect(await compter(db, 'public.cles_dossier')).toBe(1)

    await devenir(db, 'authenticated', SAM)
    expect(await compter(db, 'public.cles_dossier')).toBe(0)
  })

  test('anon ne touche a rien', async () => {
    await devenir(db, 'anon')
    expect(await refus(db, 'select * from public.cles_dossier')).toContain('permission denied')
    expect(
      await refus(
        db,
        `insert into public.cles_dossier (dossier_id, cle_scellee) values ('${dossier}', ${CLE_SCELLEE})`,
      ),
    ).toContain('permission denied')
  })

  test('personne ne remplace une cle, ni ne la supprime', async () => {
    await redevenirProprietaire(db)
    await db.query(
      `insert into public.cles_dossier (dossier_id, cle_scellee) values ('${dossier}', ${CLE_SCELLEE})`,
    )

    for (const preparer of [() => porteur('garant'), () => devenir(db, 'authenticated', MARIE)]) {
      await preparer()
      // Remplacer une cle rendrait illisibles les pieces deja scellees avec la
      // precedente, sans que rien ne le signale. Aucun role n'a ce droit.
      expect(
        await refus(db, `update public.cles_dossier set cle_scellee = ${CLE_SCELLEE}`),
      ).toContain('permission denied')
      expect(await refus(db, 'delete from public.cles_dossier')).toContain('permission denied')
    }

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.cles_dossier')).toBe(1)
  })

  test('supprimer le dossier detruit sa cle, donc ses pieces', async () => {
    await redevenirProprietaire(db)
    await db.query(
      `insert into public.cles_dossier (dossier_id, cle_scellee) values ('${dossier}', ${CLE_SCELLEE})`,
    )

    await db.query('delete from public.dossiers where id = $1', [dossier])

    // L'effacement cryptographique de l'ADR 0003 : detruire la cle suffit a
    // rendre les pieces inutilisables, meme si des copies trainent ailleurs.
    expect(await compter(db, 'public.cles_dossier')).toBe(0)
  })

  test('un tampon manifestement trop court est refuse par la base', async () => {
    await porteur('garant')
    await refus(
      db,
      `insert into public.cles_dossier (dossier_id, cle_scellee)
       values ('${dossier}', '\\x0011'::bytea)`,
    )
  })

  test('le garant d un autre dossier ne pose rien ici', async () => {
    await devenir(db, 'anon')
    const { rows } = await db.query<{ ouvrir_dossier: string }>(
      `select public.ouvrir_dossier('autre@exemple.fr')`,
    )
    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ id: string }>(
      'select id from public.dossiers where reference = $1',
      [rows[0]!.ouvrir_dossier],
    )
    const autre = d[0]!.id

    await porteur('garant')
    await refus(
      db,
      `insert into public.cles_dossier (dossier_id, cle_scellee) values ('${autre}', ${CLE_SCELLEE})`,
    )
    expect(await lignesTouchees(db, 'select 1')).toBe(0)
  })
})
