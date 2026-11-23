import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import {
  baseDEssai,
  devenir,
  devenirPorteur,
  redevenirProprietaire,
  reserverObjetDEssai,
} from './base'

/**
 * La reservation est le controle d'acces de la verification 2D-Doc : rien
 * n'est dechiffre sans elle. Elle n'accepte que l'avis d'imposition.
 */
let db: PGlite, dossier: string, agence: string, membre: string
const pieces: Record<string, string> = {}
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  dossier = randomUUID()
  agence = randomUUID()
  membre = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Essai','avis.invalid')", [agence])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@avis.invalid',now())",
    [membre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, membre],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,loyer_cents,statut) values($1,$2,'locataire@example.invalid',100000,'complet')",
    [dossier, agence],
  )
  for (const type of ['avis_imposition', 'piece_identite', 'bulletin_paie']) {
    const id = randomUUID()
    pieces[type] = id
    await reserverObjetDEssai(db, dossier, `${dossier}/${id}`)
    await db.query(
      "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values($1,$2,$3,$4,100,'application/pdf')",
      [id, dossier, type, `${dossier}/${id}`],
    )
  }
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function reserver(id = pieces.avis_imposition) {
  return (await db.query<{ ok: boolean }>('select reserver_verification_2ddoc($1) ok', [id]))
    .rows[0]!.ok
}
async function lignes() {
  await redevenirProprietaire(db)
  return (
    await db.query(
      "select acteur,acteur_id,piece_id from journal_acces where action='code_2ddoc_verifie'",
    )
  ).rows
}

test.each(['anon', 'porteur_lien', 'serveur', 'service_role', 'depot_piece'])(
  'le role %s ne peut pas reserver',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await expect(reserver()).rejects.toThrow(/permission denied/)
  },
)

test('un membre reserve pour un avis d imposition, et la tentative est journalisee', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBe(true)
  expect(await lignes()).toEqual([
    { acteur: 'agence', acteur_id: membre, piece_id: pieces.avis_imposition },
  ])
})

test.each(['piece_identite', 'bulletin_paie'])(
  'la nature %s n est jamais lue, et rien n est journalise',
  async (type) => {
    await devenir(db, 'authenticated', membre)
    expect(await reserver(pieces[type])).toBe(false)
    expect(await lignes()).toEqual([])
  },
)

test('une agence etrangere, une session sans MFA et le garant sont refuses', async () => {
  await devenir(db, 'authenticated', randomUUID())
  expect(await reserver()).toBe(false)
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal1' }),
  ])
  expect(await reserver()).toBe(false)
  expect(await lignes()).toEqual([])
  // En dernier : le refus de permission interrompt la transaction de l'essai.
  await devenirPorteur(db, dossier, 'garant')
  await expect(reserver()).rejects.toThrow(/permission denied/)
})

test('une piece absente, un dossier expire ou pas encore complet sont refuses', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await reserver(randomUUID())).toBe(false)
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '100 days',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBe(false)
  await redevenirProprietaire(db)
  // Avant un premier dossier complet, l'agence ne lit aucune piece (0087).
  await db.query(
    "update dossiers set cree_le=now(),expire_le=now()+interval '1 day',complet_le=null where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBe(false)
  expect(await lignes()).toEqual([])
})

test('la onzieme verification d une personne dans la fenetre est refusee', async () => {
  await devenir(db, 'authenticated', membre)
  for (let i = 0; i < 10; i++) expect(await reserver()).toBe(true)
  expect(await reserver()).toBe(false)
  expect(await lignes()).toHaveLength(10)
})

test('le budget de la transcription par IA n est ni consomme ni subi', async () => {
  await db.query(
    "insert into debits(cle,fenetre,compte) values('ocr:global:partage',date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch'),100)",
  )
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBe(true)
  await redevenirProprietaire(db)
  expect((await db.query("select compte from debits where cle='ocr:global:partage'")).rows).toEqual(
    [{ compte: 100 }],
  )
})
