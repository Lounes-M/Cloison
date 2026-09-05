import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * Le depot des pieces, du cote de la base.
 *
 * Deux tables se repondent : `public.pieces` porte les metadonnees,
 * `storage.objects` porte les octets. Elles doivent dire exactement la meme
 * chose de qui peut quoi, sinon la plus permissive des deux devient la regle.
 *
 * Sur `storage.objects`, l'ecriture refusee ne ressemble pas a celle des
 * autres tables : Supabase y ouvre les droits et s'en remet a la RLS. Un refus
 * s'y lit donc « violates row-level security policy », pas « permission
 * denied », et une lecture refusee ne rend rien du tout. La difference n'est
 * pas cosmetique : confondre les deux ferait passer des tests qui ne prouvent
 * rien.
 */

const MARIE = '11111111-1111-1111-1111-111111111111'
const SAM = '55555555-5555-5555-5555-555555555555'

const MEGAOCTET = 1024 * 1024

describe('depot des pieces', () => {
  let db: PGlite
  let dossier: string

  async function porteur(role: 'locataire' | 'garant', surLeDossier = dossier) {
    await db.exec('set role porteur_lien')
    await db.exec(`set request.jwt.claim.sub = ''`)
    await db.exec(`set request.jwt.claim.dossier_id = '${surLeDossier}'`)
    await db.exec(`set request.jwt.claim.role_partie = '${role}'`)
  }

  /** Un dossier neuf, par le seul chemin qui en cree. */
  async function ouvrirDossier(email: string): Promise<string> {
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

  function insertionPiece(surLeDossier: string, suffixe: string, taille = 1024) {
    return `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
            values ('${surLeDossier}', 'bulletin_paie', '${surLeDossier}/${suffixe}',
                    ${taille}, 'application/pdf')`
  }

  function insertionObjet(nom: string, seau = 'pieces') {
    return `insert into storage.objects (bucket_id, name) values ('${seau}', '${nom}')`
  }

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${MARIE}', 'marie@agence-lyon3.fr', now()),
        ('${SAM}',   'sam@autre-agence.fr',   now())
    `)
    dossier = await ouvrirDossier('locataire@exemple.fr')
  })

  // -------------------------------------------------------------------------
  // Les metadonnees
  // -------------------------------------------------------------------------

  test('le garant depose une piece dans son dossier', async () => {
    await porteur('garant')
    await db.query(insertionPiece(dossier, 'bulletin-mars'))
    expect(await compter(db, 'public.pieces')).toBe(1)
  })

  test('une piece rangee hors de son dossier est impossible', async () => {
    const autre = await ouvrirDossier('autre@exemple.fr')

    // La contrainte, pas la politique : meme le proprietaire de la table ne
    // peut pas ecrire un chemin qui pointe ailleurs.
    await redevenirProprietaire(db)
    const message = await refus(
      db,
      `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
       values ('${dossier}', 'bulletin_paie', '${autre}/vole', 1024, 'application/pdf')`,
    )
    expect(message).toContain('chemin_dans_le_dossier')
  })

  test('un type reel hors de la liste est refuse', async () => {
    await redevenirProprietaire(db)
    const message = await refus(
      db,
      `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
       values ('${dossier}', 'bulletin_paie', '${dossier}/x', 1024, 'application/zip')`,
    )
    expect(message).toContain('type_reel')
  })

  test('le locataire ne depose rien et ne voit rien', async () => {
    await redevenirProprietaire(db)
    await db.query(insertionPiece(dossier, 'bulletin-mars'))

    await porteur('locataire')
    // La cloison qui fait le produit : il suit son dossier sans voir les
    // pieces de son garant.
    expect(await compter(db, 'public.pieces')).toBe(0)
    expect(await refus(db, insertionPiece(dossier, 'ajoute'))).toContain('row-level security')
  })

  test('le garant d un autre dossier ne depose pas ici', async () => {
    const autre = await ouvrirDossier('autre@exemple.fr')
    await porteur('garant', autre)
    expect(await refus(db, insertionPiece(dossier, 'intrus'))).toContain('row-level security')
  })

  // -------------------------------------------------------------------------
  // Les plafonds
  // -------------------------------------------------------------------------

  test('un dossier s arrete a vingt pieces', async () => {
    await porteur('garant')
    for (let i = 0; i < 20; i += 1) {
      await db.query(insertionPiece(dossier, `piece-${i}`))
    }
    expect(await compter(db, 'public.pieces')).toBe(20)

    const message = await refus(db, insertionPiece(dossier, 'piece-20'))
    expect(message).toContain('vingt pieces')
  })

  test('un dossier s arrete a soixante megaoctets', async () => {
    await porteur('garant')
    for (let i = 0; i < 3; i += 1) {
      await db.query(insertionPiece(dossier, `grosse-${i}`, 20 * MEGAOCTET))
    }
    expect(await compter(db, 'public.pieces')).toBe(3)

    // Soixante megaoctets pile passent ; un octet de plus, non. Le message
    // doit dire lequel des deux plafonds a stoppe la personne.
    const message = await refus(db, insertionPiece(dossier, 'un-octet', 1))
    expect(message).toContain('megaoctets')
  })

  test('les plafonds sont par dossier, pas globaux', async () => {
    const autre = await ouvrirDossier('autre@exemple.fr')

    await porteur('garant')
    for (let i = 0; i < 20; i += 1) await db.query(insertionPiece(dossier, `piece-${i}`))

    await porteur('garant', autre)
    await db.query(insertionPiece(autre, 'premiere'))

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.pieces')).toBe(21)
  })

  // -------------------------------------------------------------------------
  // Les octets
  // -------------------------------------------------------------------------

  test('le garant envoie ses octets dans le repertoire de son dossier', async () => {
    await porteur('garant')
    await db.query(insertionObjet(`${dossier}/bulletin-mars`))
    expect(await compter(db, 'storage.objects')).toBe(1)
  })

  test('le garant ne pose rien dans le repertoire d un autre dossier', async () => {
    const autre = await ouvrirDossier('autre@exemple.fr')
    await porteur('garant')

    // Le pendant, cote octets, de la contrainte `chemin_dans_le_dossier`.
    expect(await refus(db, insertionObjet(`${autre}/vole`))).toContain('row-level security')
    expect(await refus(db, insertionObjet('sans-repertoire'))).toContain('row-level security')
  })

  test('le garant ne pose rien dans un autre seau', async () => {
    await redevenirProprietaire(db)
    await db.query(`insert into storage.buckets (id, name) values ('autre', 'autre')`)

    await porteur('garant')
    expect(await refus(db, insertionObjet(`${dossier}/x`, 'autre'))).toContain('row-level security')
  })

  test('le locataire ne voit ni ne pose aucun octet', async () => {
    await redevenirProprietaire(db)
    await db.query(insertionObjet(`${dossier}/bulletin-mars`))

    await porteur('locataire')
    expect(await compter(db, 'storage.objects')).toBe(0)
    expect(await refus(db, insertionObjet(`${dossier}/ajoute`))).toContain('row-level security')
  })

  test('une agence lit les octets de ses dossiers seulement', async () => {
    await redevenirProprietaire(db)
    await db.query(insertionObjet(`${dossier}/bulletin-mars`))

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

    // Elle lit des octets scelles, donc inertes : la cle maitresse n'est pas
    // chez Supabase.
    await devenir(db, 'authenticated', MARIE)
    expect(await compter(db, 'storage.objects')).toBe(1)

    await devenir(db, 'authenticated', SAM)
    expect(await compter(db, 'storage.objects')).toBe(0)
  })

  test('anon ne voit ni ne pose aucun octet', async () => {
    await redevenirProprietaire(db)
    await db.query(insertionObjet(`${dossier}/bulletin-mars`))

    await devenir(db, 'anon')
    expect(await compter(db, 'storage.objects')).toBe(0)
    expect(await refus(db, insertionObjet(`${dossier}/ajoute`))).toContain('row-level security')
  })

  test('le garant retire ses octets tant que le dossier n est pas parti', async () => {
    await redevenirProprietaire(db)
    await db.query(insertionObjet(`${dossier}/bulletin-mars`))

    await porteur('garant')
    await db.query(`delete from storage.objects where name = '${dossier}/bulletin-mars'`)

    await redevenirProprietaire(db)
    expect(await compter(db, 'storage.objects')).toBe(0)
  })

  test('une fois le dossier transmis, les octets ne bougent plus', async () => {
    await redevenirProprietaire(db)
    await db.query(insertionObjet(`${dossier}/bulletin-mars`))
    await db.query(`update public.dossiers set statut = 'transmis' where id = '${dossier}'`)

    await porteur('garant')
    // Ni erreur ni effet : la politique ne selectionne aucune ligne. C'est le
    // refus silencieux de Postgres, et il faut le constater sur le compte.
    await db.query(`delete from storage.objects where name = '${dossier}/bulletin-mars'`)

    await redevenirProprietaire(db)
    expect(await compter(db, 'storage.objects')).toBe(1)
  })
})
