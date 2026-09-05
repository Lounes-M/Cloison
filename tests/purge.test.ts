import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * La purge a trois mois.
 *
 * La difference entre une politique de retention et une intention, c'est
 * exactement ce fichier. Et le piege nomme par la feuille de route est son
 * test le plus important : un dossier signe ne se purge pas, et un test qui
 * le purgerait validerait un bug.
 */

describe('purger_les_dossiers_expires', () => {
  let db: PGlite

  /** Un dossier complet de tout ce qui en depend, expire ou non. */
  async function dossier(email: string, options: { expire: boolean; statut?: string }) {
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
    const id = d[0]!.id

    // Tout ce qui cascade : une piece et ses octets, une cle, un engagement,
    // un jeton, une ligne de journal.
    await db.query(
      `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
       values ($1, 'bulletin_paie', $2, 1024, 'application/pdf')`,
      [id, `${id}/bulletin`],
    )
    await db.query(`insert into storage.objects (bucket_id, name) values ('pieces', $1)`, [
      `${id}/bulletin`,
    ])
    await db.query(
      `insert into public.cles_dossier (dossier_id, cle_scellee) values ($1, '\\x${'ab'.repeat(60)}'::bytea)`,
      [id],
    )
    await db.query(`insert into public.engagements (dossier_id) values ($1)`, [id])
    // Depuis la 0018, le lien du garant attend le reglement d'un dossier de
    // locataire : on le regle ici, comme le webhook Stripe le ferait.
    await db.query(
      `update public.dossiers set paye_le = now(), paiement_ref = 'cs_test_purge_' || $1 where id = $1`,
      [id],
    )
    await db.query(`select public.emettre_jeton($1, 'garant', '7 days')`, [id])
    await db.query(
      `insert into public.journal_acces (dossier_id, action, acteur) values ($1, 'dossier_consulte', 'locataire')`,
      [id],
    )

    if (options.statut) {
      await db.query('update public.dossiers set statut = $1 where id = $2', [options.statut, id])
    }
    if (options.expire) {
      // `expire_le > cree_le` est une contrainte : on recule les deux.
      await db.query(
        `update public.dossiers
            set cree_le = now() - interval '4 months', expire_le = now() - interval '1 day'
          where id = $1`,
        [id],
      )
    }
    return id
  }

  async function purger(): Promise<number> {
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ purger_les_dossiers_expires: number }>(
      'select public.purger_les_dossiers_expires()',
    )
    return rows[0]!.purger_les_dossiers_expires
  }

  beforeEach(async () => {
    db = await baseDEssai()
  })

  test('un dossier expire disparait avec tout ce qui en depend', async () => {
    const id = await dossier('expire@exemple.fr', { expire: true })

    expect(await purger()).toBe(1)

    for (const table of [
      'public.dossiers',
      'public.pieces',
      'public.engagements',
      'public.cles_dossier',
      'public.jetons_actifs',
      'public.journal_acces',
      'storage.objects',
    ]) {
      expect(await compter(db, table)).toBe(0)
    }

    // Le jeton ne vaut plus rien, meme parfaitement signe : `jeton_est_actif`
    // ne trouve plus la ligne. C'est ce qui ferme la porte avant que le lien
    // expire de lui-meme.
    await devenir(db, 'serveur')
    const { rows } = await db.query<{ jeton_est_actif: boolean }>(
      `select public.jeton_est_actif($1, 'garant', gen_random_uuid())`,
      [id],
    )
    expect(rows[0]!.jeton_est_actif).toBe(false)
  })

  test('un dossier encore vivant ne bouge pas', async () => {
    await dossier('vivant@exemple.fr', { expire: false })

    expect(await purger()).toBe(0)
    expect(await compter(db, 'public.dossiers')).toBe(1)
    expect(await compter(db, 'storage.objects')).toBe(1)
  })

  test('un acte signe echappe a la regle, meme expire', async () => {
    // Le piege nomme par la feuille de route. L'acte est un contrat : il
    // survit au bail. Un test qui le purgerait validerait un bug.
    await dossier('signe@exemple.fr', { expire: true, statut: 'signe' })

    expect(await purger()).toBe(0)
    expect(await compter(db, 'public.dossiers')).toBe(1)
    expect(await compter(db, 'public.cles_dossier')).toBe(1)
    expect(await compter(db, 'storage.objects')).toBe(1)
  })

  test('elle ne purge que les expires, et compte juste', async () => {
    await dossier('a@exemple.fr', { expire: true })
    await dossier('b@exemple.fr', { expire: true, statut: 'transmis' })
    await dossier('c@exemple.fr', { expire: false })
    await dossier('d@exemple.fr', { expire: true, statut: 'signe' })

    expect(await purger()).toBe(2)
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ email_locataire: string }>(
      'select email_locataire from public.dossiers order by 1',
    )
    expect(rows.map((r) => r.email_locataire)).toEqual(['c@exemple.fr', 'd@exemple.fr'])
  })

  test('les octets des autres dossiers ne sont pas touches', async () => {
    await dossier('expire@exemple.fr', { expire: true })
    const vivant = await dossier('vivant@exemple.fr', { expire: false })

    await purger()
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ name: string }>('select name from storage.objects')
    expect(rows).toEqual([{ name: `${vivant}/bulletin` }])
  })

  test('personne ne l appelle par l API', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await devenir(db, role)
      expect(await refus(db, 'select public.purger_les_dossiers_expires()')).toContain(
        'permission denied',
      )
    }
    await db.exec('set role porteur_lien')
    expect(await refus(db, 'select public.purger_les_dossiers_expires()')).toContain(
      'permission denied',
    )
  })

  test('rejouee, elle ne trouve plus rien', async () => {
    await dossier('expire@exemple.fr', { expire: true })
    expect(await purger()).toBe(1)
    expect(await purger()).toBe(0)
  })
})
