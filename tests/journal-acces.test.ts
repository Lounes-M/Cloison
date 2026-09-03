import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * Le journal des acces.
 *
 * Un journal se juge sur deux questions, et aucune ne porte sur ce qu'il sait
 * enregistrer. La premiere : peut-on y ecrire une ligne qui accuse quelqu'un
 * d'autre. La seconde : peut-on effacer celle qui nous accuse. Les tests
 * portent donc presque tous sur des refus.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const SAM = '55555555-5555-5555-5555-555555555555'

describe('journal des acces', () => {
  let db: PGlite
  let dossier: string
  let piece: string

  async function porteur(role: 'locataire' | 'garant', surLeDossier = dossier) {
    await db.exec('set role porteur_lien')
    await db.exec(`set request.jwt.claim.sub = ''`)
    await db.exec(`set request.jwt.claim.dossier_id = '${surLeDossier}'`)
    await db.exec(`set request.jwt.claim.role_partie = '${role}'`)
  }

  async function ouvrirDossier(email: string): Promise<string> {
    await devenir(db, 'anon')
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

  async function deposerPiece(surLeDossier: string, suffixe: string): Promise<string> {
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ id: string }>(
      `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
       values ($1, 'bulletin_paie', $2, 1024, 'application/pdf')
       returning id`,
      [surLeDossier, `${surLeDossier}/${suffixe}`],
    )
    return rows[0]!.id
  }

  /** Rattache le dossier a l'agence de Marie, les deux agences existant. */
  async function rattacherAMarie() {
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
  }

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${MARIE}', 'marie@agence-lyon3.fr', now()),
        ('${SAM}',   'sam@autre-agence.fr',   now())
    `)
    dossier = await ouvrirDossier('locataire@exemple.fr')
    piece = await deposerPiece(dossier, 'bulletin-mars')
  })

  // -------------------------------------------------------------------------
  // On n'ecrit que sur soi
  // -------------------------------------------------------------------------

  test('le garant inscrit un depot sur son dossier', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'piece_deposee', '${piece}')`)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ acteur: string; acteur_id: string | null }>(
      'select acteur, acteur_id from public.journal_acces',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ acteur: 'garant', acteur_id: null })
  })

  test('l acteur vient du jeton, jamais de l appelant', async () => {
    // Le coeur de la table. La fonction ne prend aucun parametre d'identite :
    // il n'y a donc pas de valeur a falsifier, plutot qu'une valeur difficile
    // a falsifier.
    await porteur('locataire')
    await db.query(`select public.journaliser('${dossier}', 'dossier_consulte')`)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ acteur: string }>('select acteur from public.journal_acces')
    expect(rows[0]!.acteur).toBe('locataire')
  })

  test('une agence est inscrite avec son identite', async () => {
    await rattacherAMarie()
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.journaliser('${dossier}', 'dossier_consulte')`)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ acteur: string; acteur_id: string }>(
      'select acteur, acteur_id from public.journal_acces',
    )
    expect(rows[0]).toEqual({ acteur: 'agence', acteur_id: MARIE })
  })

  test('un porteur n inscrit rien sur le dossier d un autre', async () => {
    const autre = await ouvrirDossier('autre@exemple.fr')
    await porteur('garant')

    expect(await refus(db, `select public.journaliser('${autre}', 'dossier_consulte')`)).toContain(
      'Aucun acces',
    )
    await redevenirProprietaire(db)
    expect(await compter(db, 'public.journal_acces')).toBe(0)
  })

  test('une agence n inscrit rien sur le dossier d une autre', async () => {
    await rattacherAMarie()
    await devenir(db, 'authenticated', SAM)

    expect(
      await refus(db, `select public.journaliser('${dossier}', 'dossier_consulte')`),
    ).toContain('Aucun acces')
  })

  test('anon n atteint pas la fonction', async () => {
    await devenir(db, 'anon')
    // Un inconnu qui connaitrait un identifiant de dossier pourrait sinon
    // remplir son journal.
    expect(
      await refus(db, `select public.journaliser('${dossier}', 'dossier_consulte')`),
    ).toContain('permission denied')
  })

  test('une piece d un autre dossier est refusee', async () => {
    const autre = await ouvrirDossier('autre@exemple.fr')
    const sienne = await deposerPiece(autre, 'la-sienne')

    await porteur('garant')
    expect(
      await refus(db, `select public.journaliser('${dossier}', 'piece_ouverte', '${sienne}')`),
    ).toContain('appartient pas')
  })

  test('une action inconnue est refusee par la contrainte', async () => {
    await porteur('garant')
    expect(await refus(db, `select public.journaliser('${dossier}', 'tout_efface')`)).toContain(
      'journal_acces_action_check',
    )
  })

  // -------------------------------------------------------------------------
  // Ce qui est ecrit ne se reecrit pas
  // -------------------------------------------------------------------------

  test('personne n a le droit de modifier ni de supprimer', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'piece_deposee', '${piece}')`)

    for (const preparer of [
      () => porteur('garant'),
      () => devenir(db, 'authenticated', MARIE),
      () => devenir(db, 'anon'),
    ]) {
      await preparer()
      expect(await refus(db, `update public.journal_acces set acteur = 'agence'`)).toContain(
        'permission denied',
      )
      expect(await refus(db, 'delete from public.journal_acces')).toContain('permission denied')
    }

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.journal_acces')).toBe(1)
  })

  test('le declencheur tient meme si un droit et une politique s ouvraient', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'piece_deposee', '${piece}')`)

    // On simule la faute future : quelqu'un accorde le droit ET ecrit la
    // politique qui va avec. C'est exactement le cas ou le refus par absence
    // de droit ne protege plus, et ou la derniere barriere doit tenir.
    await redevenirProprietaire(db)
    await db.exec(`
      grant update, delete on public.journal_acces to authenticated;
      create policy "essai reecriture" on public.journal_acces
        for update to authenticated using (true) with check (true);
      create policy "essai suppression" on public.journal_acces
        for delete to authenticated using (true);
    `)

    await devenir(db, 'authenticated', MARIE)
    expect(await refus(db, `update public.journal_acces set acteur = 'agence'`)).toContain(
      'ne se modifie pas',
    )
    expect(await refus(db, 'delete from public.journal_acces')).toContain('ne se modifie pas')

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.journal_acces')).toBe(1)
  })

  test('une entree survit au retrait de la piece qu elle designe', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'piece_ouverte', '${piece}')`)
    await db.query(`delete from public.pieces where id = '${piece}'`)

    await redevenirProprietaire(db)
    // Sans cle etrangere : le journal s'effacerait au moment ou il servirait.
    const { rows } = await db.query<{ piece_id: string }>(
      'select piece_id from public.journal_acces',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.piece_id).toBe(piece)
  })

  test('supprimer le dossier emporte son journal', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'dossier_consulte')`)

    await redevenirProprietaire(db)
    // La bonne facon d'oublier. Barrer le proprietaire aussi rendrait un
    // dossier indestructible, donc ineffacable.
    await db.query(`delete from public.dossiers where id = '${dossier}'`)
    expect(await compter(db, 'public.journal_acces')).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Qui lit le journal
  // -------------------------------------------------------------------------

  test('le garant lit le journal de son dossier', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'piece_deposee', '${piece}')`)

    // La transparence que le produit vend : il a depose, il voit qui regarde.
    expect(await compter(db, 'public.journal_acces')).toBe(1)
  })

  test('le locataire ne lit rien du journal', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'piece_deposee', '${piece}')`)

    await porteur('locataire')
    // Lui montrer qu'une piece a ete ouverte lui apprendrait qu'elle existe.
    expect(await compter(db, 'public.journal_acces')).toBe(0)
  })

  test('une agence lit le journal de ses dossiers seulement', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'piece_deposee', '${piece}')`)
    await rattacherAMarie()

    await devenir(db, 'authenticated', MARIE)
    expect(await compter(db, 'public.journal_acces')).toBe(1)

    await devenir(db, 'authenticated', SAM)
    expect(await compter(db, 'public.journal_acces')).toBe(0)
  })

  test('le garant d un autre dossier ne lit rien ici', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'piece_deposee', '${piece}')`)

    const autre = await ouvrirDossier('autre@exemple.fr')
    await porteur('garant', autre)
    expect(await compter(db, 'public.journal_acces')).toBe(0)
  })

  test('anon ne lit rien du journal', async () => {
    await porteur('garant')
    await db.query(`select public.journaliser('${dossier}', 'dossier_consulte')`)

    await devenir(db, 'anon')
    expect(await refus(db, 'select * from public.journal_acces')).toContain('permission denied')
  })
})
