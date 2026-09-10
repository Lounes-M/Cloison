import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { baseDEssai, devenir, redevenirProprietaire, reserverObjetDEssai } from './base'
let db: PGlite, dossier: string, agence: string, membre: string, piece: string
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
  piece = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Essai','ocr.invalid')", [agence])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@ocr.invalid',now())",
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
  await reserverObjetDEssai(db, dossier, `${dossier}/${piece}`)
  await db.query(
    "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values($1,$2,'bulletin_paie',$3,100,'application/pdf')",
    [piece, dossier, `${dossier}/${piece}`],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function reserver(id = piece) {
  return (await db.query<{ ok: boolean }>('select reserver_lecture_ocr($1) ok', [id])).rows[0]!.ok
}
test.each(['anon', 'porteur_lien', 'serveur', 'service_role', 'depot_piece'])(
  'le role %s ne peut pas reserver',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await expect(reserver()).rejects.toThrow(/permission denied/)
  },
)
test('une agence etrangere ou sans MFA ne peut pas demander une extraction', async () => {
  await devenir(db, 'authenticated', randomUUID())
  expect(await reserver()).toBe(false)
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal1' }),
  ])
  expect(await reserver()).toBe(false)
})
test('une piece absente ou expiree ne peut pas etre extraite', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await reserver(randomUUID())).toBe(false)
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '100 days',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBe(false)
})
test('la sixieme demande est refusee et le journal ne contient que cinq reservations', async () => {
  await devenir(db, 'authenticated', membre)
  for (let i = 0; i < 5; i++) expect(await reserver()).toBe(true)
  expect(await reserver()).toBe(false)
  await redevenirProprietaire(db)
  const lignes = (
    await db.query('select acteur_id,piece_id from journal_acces where action=$1', ['ocr_demande'])
  ).rows
  expect(lignes).toHaveLength(5)
  expect(lignes[0]).toEqual({ acteur_id: membre, piece_id: piece })
  expect(
    (await db.query("select compte from debits where cle='ocr:global:partage'")).rows[0],
  ).toEqual({ compte: 5 })
})
test.each(['ocr:global:partage', 'ocr:agence:'])(
  'le budget partage %s refuse meme un nouvel acteur',
  async (prefixe) => {
    const cle = prefixe === 'ocr:global:partage' ? prefixe : prefixe + agence
    await db.query(
      "insert into debits(cle,fenetre,compte) values($1,date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch'),$2)",
      [cle, prefixe === 'ocr:global:partage' ? 100 : 30],
    )
    await devenir(db, 'authenticated', membre)
    expect(await reserver()).toBe(false)
  },
)
test('la panne du journal annule aussi la consommation', async () => {
  await db.exec(
    "create function refus_ocr_essai() returns trigger language plpgsql as $$begin raise exception 'Journal refuse'; end;$$; create trigger refus_ocr_essai before insert on journal_acces for each row execute function refus_ocr_essai(); savepoint tentative",
  )
  await devenir(db, 'authenticated', membre)
  await expect(reserver()).rejects.toThrow('Journal refuse')
  await db.exec('rollback to savepoint tentative')
  await redevenirProprietaire(db)
  expect(
    (await db.query("select count(*)::int n from debits where cle like 'ocr:%'")).rows[0],
  ).toEqual({ n: 0 })
})
