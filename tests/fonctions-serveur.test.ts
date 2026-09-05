import { devenirPorteur } from './base'
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * Ce que la cle publiable ne peut plus faire seule.
 *
 * La cle publiable est publique par construction : tout ce qu'une migration
 * accorde a `anon` est appelable par n'importe qui, directement sur l'API
 * PostgREST, sans passer par nos routes. La migration 0019 retire a `anon`
 * les quatre fonctions qui creaient, emettaient ou comptaient, et les reserve
 * au role `serveur`, que seule notre signature fait exister.
 *
 * Ces tests s'ecrivent par interdiction : ce qui compte n'est pas que le
 * serveur puisse, c'est que personne d'autre ne puisse.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const NUL = '00000000-0000-0000-0000-000000000000'
const EMPREINTE = 'a'.repeat(64)

describe('les fonctions reservees au serveur', () => {
  let db: PGlite
  let dossier: string

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

  /** Chaque appel que la cle publiable pouvait faire avant la 0019. */
  function appels(): Array<[string, string]> {
    return [
      ['ouvrir_dossier', `select public.ouvrir_dossier('x@exemple.fr')`],
      [
        'ouvrir_dossier_avec_lien',
        `select * from public.ouvrir_dossier_avec_lien('x@exemple.fr', '7 days')`,
      ],
      ['emettre_jeton', `select * from public.emettre_jeton('${dossier}', 'locataire', '7 days')`],
      ['jeton_est_actif', `select public.jeton_est_actif('${dossier}', 'locataire', '${NUL}')`],
      ['consommer_debit', `select public.consommer_debit('ouverture_dossier', '${EMPREINTE}')`],
    ]
  }

  test('anon n atteint aucune de ces fonctions', async () => {
    await devenir(db, 'anon')
    for (const [nom, sql] of appels()) {
      expect(await refus(db, sql), nom).toContain('permission denied')
    }

    // Et rien n'a ete cree ni compte en chemin.
    await redevenirProprietaire(db)
    expect(await compter(db, 'public.dossiers')).toBe(1)
    expect(await compter(db, 'public.jetons_actifs')).toBe(0)
    expect(await compter(db, 'public.debits')).toBe(0)
  })

  test('un porteur de lien n atteint aucune de ces fonctions', async () => {
    await devenirPorteur(db, dossier, 'locataire')
    for (const [nom, sql] of appels()) {
      expect(await refus(db, sql), nom).toContain('permission denied')
    }
  })

  test('un collaborateur d agence n emet ni ne verifie un jeton, et ne compte pas', async () => {
    await devenir(db, 'authenticated', MARIE)
    for (const [nom, sql] of appels()) {
      // L'ouverture reste a l'agence : c'est son propre jeton qui rattache le
      // dossier. Le reste n'a jamais ete appele avec son client.
      if (nom.startsWith('ouvrir_dossier')) continue
      expect(await refus(db, sql), nom).toContain('permission denied')
    }
  })

  test('le serveur, lui, ouvre, emet, verifie et compte', async () => {
    await devenir(db, 'serveur')

    const ouvert = await db.query<{ dossier_id: string; jti: string }>(
      `select * from public.ouvrir_dossier_avec_lien('y@exemple.fr', '7 days')`,
    )
    expect(ouvert.rows[0]!.jti).toMatch(/^[0-9a-f-]{36}$/)

    const emis = await db.query<{ jti: string }>(
      `select * from public.emettre_jeton('${dossier}', 'locataire', '7 days')`,
    )
    const verifie = await db.query<{ jeton_est_actif: boolean }>(
      `select public.jeton_est_actif('${dossier}', 'locataire', '${emis.rows[0]!.jti}')`,
    )
    expect(verifie.rows[0]!.jeton_est_actif).toBe(true)

    const compte = await db.query<{ consommer_debit: boolean }>(
      `select public.consommer_debit('ouverture_dossier', '${EMPREINTE}')`,
    )
    expect(compte.rows[0]!.consommer_debit).toBe(true)
  })

  test('un dossier ouvert par le serveur n appartient a aucune agence', async () => {
    // Le serveur ne porte pas d'agence : `agence_courante()` est nul, et le
    // dossier reste celui du locataire, comme quand `anon` ouvrait.
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ agence_id: string | null }>(
      'select agence_id from public.dossiers where id = $1',
      [dossier],
    )
    expect(rows[0]!.agence_id).toBeNull()
  })

  test('le serveur ne lit toujours aucune table', async () => {
    await devenir(db, 'serveur')
    for (const table of [
      'public.dossiers',
      'public.jetons_actifs',
      'public.debits',
      'public.agences',
      'public.membres_agence',
    ]) {
      expect(await refus(db, `select * from ${table}`), table).toContain('permission denied')
    }
  })
})
