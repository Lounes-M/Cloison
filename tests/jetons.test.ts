import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * La revocation, cote base.
 *
 * L'ADR 0006 tient a une phrase : le lien est reemissible, le jeton ne l'est
 * pas. Ces tests verifient que la reemission revoque VRAIMENT le precedent,
 * parce que c'est la seule chose qui empeche un vieux message de rouvrir un
 * dossier des mois plus tard.
 */

describe('jetons de capacite', () => {
  let db: PGlite
  let dossier: string

  async function emettre(partie: 'locataire' | 'garant', duree = '7 days') {
    const { rows } = await db.query<{ jti: string; expire_le: string }>(
      `select * from public.emettre_jeton($1, $2, $3::interval)`,
      [dossier, partie, duree],
    )
    return rows[0]!
  }

  async function actif(partie: string, jti: string) {
    const { rows } = await db.query<{ jeton_est_actif: boolean }>(
      `select public.jeton_est_actif($1, $2, $3)`,
      [dossier, partie, jti],
    )
    return rows[0]!.jeton_est_actif
  }

  beforeEach(async () => {
    db = await baseDEssai()
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

  test('un jeton fraichement emis est actif', async () => {
    const { jti } = await emettre('garant')
    expect(await actif('garant', jti)).toBe(true)
  })

  test('reemettre revoque le precedent', async () => {
    const premier = await emettre('garant')
    const second = await emettre('garant')

    expect(premier.jti).not.toBe(second.jti)

    // Le coeur de l'ADR 0006. Sans cette ligne rouge, un lien qui traine dans
    // une vieille boite resterait ouvert.
    expect(await actif('garant', premier.jti)).toBe(false)
    expect(await actif('garant', second.jti)).toBe(true)
  })

  test('il n existe jamais deux jetons pour la meme partie', async () => {
    await emettre('garant')
    await emettre('garant')
    await emettre('garant')

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.jetons_actifs
        where dossier_id = $1 and partie = 'garant'`,
      [dossier],
    )
    expect(rows[0]!.n).toBe(1)
  })

  test('le locataire et le garant ont chacun le leur', async () => {
    const loc = await emettre('locataire')
    const gar = await emettre('garant')

    // Reemettre pour l'un ne doit pas toucher l'autre : ils partagent le role
    // Postgres mais pas leur jeton.
    await emettre('garant')
    expect(await actif('locataire', loc.jti)).toBe(true)
    expect(await actif('garant', gar.jti)).toBe(false)
  })

  test('un jti invente ne vaut rien', async () => {
    await emettre('garant')
    expect(await actif('garant', '00000000-0000-0000-0000-000000000000')).toBe(false)
  })

  test('le jeton du garant ne vaut pas pour le locataire', async () => {
    const { jti } = await emettre('garant')

    // Le meme jti, presente sous l'autre partie : refuse. C'est la seule chose
    // qui distingue les deux, elle doit donc etre verifiee ici aussi.
    expect(await actif('locataire', jti)).toBe(false)
  })

  test('un jeton expire ne vaut plus rien', async () => {
    const { jti } = await emettre('garant', '1 second')
    await redevenirProprietaire(db)
    // On recule aussi `emis_le` : la contrainte exige que l'expiration suive
    // l'emission, et un jeton qui aurait expire avant d'etre emis n'existe
    // pas. C'est le passe qu'on simule, pas une incoherence.
    await db.query(
      `update public.jetons_actifs
          set emis_le   = now() - interval '10 minutes',
              expire_le = now() - interval '1 minute'
        where dossier_id = $1`,
      [dossier],
    )
    expect(await actif('garant', jti)).toBe(false)
  })

  test('un jeton ne survit jamais au dossier qu il ouvre', async () => {
    await redevenirProprietaire(db)
    await db.query(
      `update public.dossiers set expire_le = now() + interval '2 days' where id = $1`,
      [dossier],
    )

    // Sept jours demandes, deux jours restants au dossier : c'est le dossier
    // qui borne.
    const { expire_le } = await emettre('garant', '7 days')
    const { rows } = await db.query<{ jours: number }>(
      `select round(extract(epoch from ($1::timestamptz - now())) / 86400)::int as jours`,
      [expire_le],
    )
    expect(rows[0]!.jours).toBe(2)
  })

  test('supprimer le dossier emporte ses jetons', async () => {
    await emettre('garant')
    await redevenirProprietaire(db)
    await db.query('delete from public.dossiers where id = $1', [dossier])
    expect(await compter(db, 'public.jetons_actifs')).toBe(0)
  })

  test('personne ne lit ni n ecrit la table directement', async () => {
    await emettre('garant')

    for (const role of ['anon', 'authenticated', 'porteur_lien'] as const) {
      await devenir(db, role)
      // RLS activee et zero politique : la table refuse tout, meme aux roles
      // qui appellent les fonctions.
      expect(await refus(db, 'select * from public.jetons_actifs')).toContain('permission denied')
    }
  })

  test('une partie inconnue est refusee', async () => {
    await devenir(db, 'anon')
    await refus(db, `select * from public.emettre_jeton('${dossier}', 'agence', '7 days')`)
  })

  test('un dossier inconnu est refuse', async () => {
    await devenir(db, 'anon')
    await refus(
      db,
      `select * from public.emettre_jeton('00000000-0000-0000-0000-000000000000', 'garant', '7 days')`,
    )
  })
})
