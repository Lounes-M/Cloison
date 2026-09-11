import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
export async function verifierReutilisationPieces(db, connexion) {
  await db.query('begin')
  try {
    await db.query(readFileSync('supabase/essais/reutilisation-pieces.sql', 'utf8'))
  } finally {
    await db.query('rollback')
  }
  const source = randomUUID(),
    cible = randomUUID(),
    piece = randomUUID(),
    jti = randomUUID(),
    jtiCible = randomUUID()
  const clients = [
    new Client({ connectionString: connexion }),
    new Client({ connectionString: connexion }),
  ]
  const claims = {
    role: 'depot_piece',
    role_partie: 'garant',
    dossier_id: cible,
    jti: jtiCible,
    copie_version: 'copie-v1',
    copie_dossier: source,
    copie_jti: jti,
    copie_piece: piece,
    copie_empreinte: 'a'.repeat(64),
  }
  async function reserver(dossier, id) {
    const chemin = dossier + '/' + id
    await db.query('insert into reservations_depot(dossier_id,chemin) values($1,$2)', [
      dossier,
      chemin,
    ])
    await db.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [chemin])
    return chemin
  }
  try {
    await Promise.all(clients.map((c) => c.connect()))
    for (const id of [source, cible]) {
      await db.query(
        "insert into dossiers(id,email_locataire,reference) values($1::uuid,'copie@example.invalid','CP'||substr($1::uuid::text,1,12))",
        [id],
      )
      await db.query(
        "insert into jetons_actifs(dossier_id,partie,jti,expire_le) values($1,'garant',$2,clock_timestamp()+interval '1 day')",
        [id, id === source ? jti : jtiCible],
      )
    }
    const chemin = await reserver(source, piece)
    await db.query('begin;set local role depot_piece')
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role: 'depot_piece', role_partie: 'garant', dossier_id: source, jti }),
    ])
    await db.query(
      "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values($1,$2,'piece_identite',$3,100,'application/pdf')",
      [piece, source, chemin],
    )
    await db.query('commit')
    const chemins = await Promise.all(clients.map(() => reserver(cible, randomUUID())))
    const resultats = await Promise.all(
      clients.map(async (c, i) => {
        await c.query('begin;set local role depot_piece')
        await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)])
        try {
          await c.query(
            "insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values($1,'piece_identite',$2,100,'application/pdf')",
            [cible, chemins[i]],
          )
          await c.query('commit')
          return 'copie'
        } catch (e) {
          await c.query('rollback')
          assert.equal(e.code, '23505')
          return 'doublon'
        }
      }),
    )
    assert.equal(resultats.filter((r) => r === 'copie').length, 1)
    assert.equal(
      (
        await db.query('select count(*)::int n from provenances_pieces where dossier_id=$1', [
          cible,
        ])
      ).rows[0].n,
      1,
    )
    console.log(
      'OK : reutilisation PostgreSQL, droits, conservation independante et une seule copie concurrente',
    )
  } finally {
    await db.query('rollback')
    await Promise.allSettled(clients.map((c) => c.end()))
    await db.query('delete from dossiers where id=any($1::uuid[])', [[source, cible]])
  }
}
