import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import {
  baseDEssai,
  devenirPorteur,
  devenirDepot,
  redevenirProprietaire,
  reserverObjetDEssai,
} from './base'
let db: PGlite, source: string, cible: string, piece: string, jti: string
const empreinte = 'a'.repeat(64)
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  const rows = (
    await db.query<{ id: string }>(
      "insert into dossiers(email_locataire,email_garant,reference) values('l@example.invalid','g@example.invalid','COPIESOURCE'),('l2@example.invalid','g@example.invalid','COPIECIBLE') returning id",
    )
  ).rows
  source = rows[0]!.id
  cible = rows[1]!.id
  await devenirDepot(db, source)
  jti = (
    await db.query<{ j: string }>("select current_setting('request.jwt.claims')::jsonb->>'jti' j")
  ).rows[0]!.j
  const chemin = source + '/11111111-1111-4111-8111-111111111111'
  await reserverObjetDEssai(db, source, chemin)
  await db.query(
    "insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values($1,'piece_identite',$2,100,'application/pdf')",
    [source, chemin],
  )
  await redevenirProprietaire(db)
  piece = (await db.query<{ id: string }>('select id from pieces where dossier_id=$1', [source]))
    .rows[0]!.id
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function copier(
  modifications: Record<string, unknown> = {},
  suffixe = '22222222-2222-4222-8222-222222222222',
) {
  await devenirDepot(db, cible)
  const claims = (
    await db.query<{ c: Record<string, unknown> }>(
      "select current_setting('request.jwt.claims')::jsonb c",
    )
  ).rows[0]!.c
  const chemin = cible + '/' + suffixe
  await reserverObjetDEssai(db, cible, chemin)
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      ...claims,
      copie_version: 'copie-v1',
      copie_dossier: source,
      copie_jti: jti,
      copie_piece: piece,
      copie_empreinte: empreinte,
      ...modifications,
    }),
  ])
  await db.query(
    "insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values($1,'piece_identite',$2,100,'application/pdf')",
    [cible, chemin],
  )
}
test('copie atomique, provenance privee et independance de la source', async () => {
  await copier()
  await devenirPorteur(db, cible, 'garant')
  const p = (
    await db.query<{ source_piece_id: string; consentement_version: string }>(
      'select * from provenances_pieces',
    )
  ).rows
  expect(p).toHaveLength(1)
  expect(p[0]!.source_piece_id).toBe(piece)
  expect(p[0]!.consentement_version).toBe('copie-v1')
  await devenirPorteur(db, cible, 'locataire')
  expect((await db.query('select * from provenances_pieces')).rows).toEqual([])
  await devenirPorteur(db, source, 'garant')
  expect((await db.query('select * from provenances_pieces')).rows).toEqual([])
  await redevenirProprietaire(db)
  await db.query('delete from pieces where id=$1', [piece])
  expect((await db.query('select * from provenances_pieces')).rows).toHaveLength(1)
  await db.query('delete from pieces where dossier_id=$1', [cible])
  expect((await db.query('select * from provenances_pieces')).rows).toHaveLength(0)
})
test.each([
  'revoque',
  'expire',
  'supprime',
  'mauvais-jti',
  'mauvaise-piece',
  'mauvaise-version',
  'version-nulle',
  'mauvaise-empreinte',
  'meme-dossier',
  'taille-modifiee',
])('refuse source invalide : %s', async (cas) => {
  const m: Record<string, unknown> = {}
  if (cas === 'revoque') await db.query('delete from jetons_actifs where dossier_id=$1', [source])
  if (cas === 'expire')
    await db.query(
      "update dossiers set cree_le=now()-interval '2 days',expire_le=now()-interval '1 second' where id=$1",
      [source],
    )
  if (cas === 'supprime') await db.query('delete from pieces where id=$1', [piece])
  if (cas === 'taille-modifiee')
    await db.query('update pieces set taille_octets=101 where id=$1', [piece])
  if (cas === 'mauvais-jti') m.copie_jti = cible
  if (cas === 'mauvaise-piece') m.copie_piece = cible
  if (cas === 'version-nulle') m.copie_version = null
  if (cas === 'mauvaise-version') m.copie_version = 'sans-consentement'
  if (cas === 'mauvaise-empreinte') m.copie_empreinte = 'clair'
  if (cas === 'meme-dossier') m.copie_dossier = cible
  await expect(copier(m)).rejects.toThrow('Copie non autorisee')
})
test('deux copies de la meme piece sont refusees par la base', async () => {
  await copier()
  await expect(copier({}, '33333333-3333-4333-8333-333333333333')).rejects.toThrow(/unique/)
})
test.each(['anon', 'authenticated', 'serveur', 'depot_piece'])(
  'aucun acces direct a la provenance : %s',
  async (role) => {
    await copier()
    await redevenirProprietaire(db)
    await db.exec(`set role ${role}`)
    await expect(db.query('select * from provenances_pieces')).rejects.toThrow(/permission denied/)
  },
)
