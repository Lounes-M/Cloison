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
  await db.query("insert into agences(id,nom,domaine) values($1,'Essai','lecture.invalid')", [
    agence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@lecture.invalid',now())",
    [membre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, membre],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,loyer_cents) values($1,$2,'locataire@example.invalid',100000)",
    [dossier, agence],
  )
  for (const type of ['bulletin_paie', 'pension_retraite', 'piece_identite', 'avis_imposition']) {
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
async function reserver(id = pieces.bulletin_paie) {
  return (await db.query<{ ok: boolean }>('select reserver_lecture_ia_garant($1) ok', [id]))
    .rows[0]!.ok
}
test.each(['anon', 'authenticated', 'serveur', 'service_role', 'depot_piece'])(
  'le role %s ne peut pas reserver',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await expect(reserver()).rejects.toThrow(/permission denied/)
  },
)
test('le garant reserve un bulletin et une pension, et la tentative est journalisee', async () => {
  await devenirPorteur(db, dossier, 'garant')
  expect(await reserver()).toBe(true)
  expect(await reserver(pieces.pension_retraite)).toBe(true)
  await redevenirProprietaire(db)
  const lignes = (
    await db.query(
      "select acteur,acteur_id,piece_id from journal_acces where action='lecture_ia_garant' order by quand",
    )
  ).rows
  expect(lignes).toEqual([
    { acteur: 'garant', acteur_id: null, piece_id: pieces.bulletin_paie },
    { acteur: 'garant', acteur_id: null, piece_id: pieces.pension_retraite },
  ])
})
test.each(['piece_identite', 'avis_imposition'])('la nature %s ne part jamais', async (type) => {
  await devenirPorteur(db, dossier, 'garant')
  expect(await reserver(pieces[type])).toBe(false)
  await redevenirProprietaire(db)
  expect(
    (await db.query("select count(*)::int n from journal_acces where action='lecture_ia_garant'"))
      .rows[0],
  ).toEqual({ n: 0 })
})
test('le locataire et l agence ne peuvent pas reserver pour le garant', async () => {
  await devenirPorteur(db, dossier, 'locataire')
  expect(await reserver()).toBe(false)
  await devenir(db, 'authenticated', membre)
  await expect(reserver()).rejects.toThrow(/permission denied/)
})
test('un autre dossier, un dossier transmis ou expire ne peut pas etre lu', async () => {
  const autre = randomUUID(),
    etrangere = randomUUID()
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,loyer_cents) values($1,$2,'autre@example.invalid',100000)",
    [autre, agence],
  )
  await reserverObjetDEssai(db, autre, `${autre}/${etrangere}`)
  await db.query(
    "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values($1,$2,'bulletin_paie',$3,100,'application/pdf')",
    [etrangere, autre, `${autre}/${etrangere}`],
  )
  await devenirPorteur(db, dossier, 'garant')
  expect(await reserver(etrangere)).toBe(false)
  expect(await reserver(randomUUID())).toBe(false)
  await redevenirProprietaire(db)
  await db.query("update dossiers set statut='transmis' where id=$1", [dossier])
  await devenirPorteur(db, dossier, 'garant')
  expect(await reserver()).toBe(false)
})
test('le neuvieme fichier du dossier dans la fenetre est refuse', async () => {
  await devenirPorteur(db, dossier, 'garant')
  for (let i = 0; i < 8; i++) expect(await reserver()).toBe(true)
  expect(await reserver()).toBe(false)
})
test('le budget global partage avec l agence refuse aussi le garant', async () => {
  await db.query(
    "insert into debits(cle,fenetre,compte) values('ocr:global:partage',date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch'),100)",
  )
  await devenirPorteur(db, dossier, 'garant')
  expect(await reserver()).toBe(false)
})
