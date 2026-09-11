import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

export async function verifierBrouillonsEngagement(db, connexion) {
  const dossier = randomUUID(),
    jti = randomUUID()
  await db.query(
    "insert into dossiers(id,email_locataire,reference) values($1::uuid,'brouillon@example.invalid','B'||substr($1::uuid::text,1,10))",
    [dossier],
  )
  await db.query(
    "insert into jetons_actifs(dossier_id,partie,jti,expire_le) values($1,'garant',$2,clock_timestamp()+interval '1 day')",
    [dossier, jti],
  )
  const clients = Array.from({ length: 2 }, () => new Client({ connectionString: connexion }))
  try {
    await Promise.all(clients.map((c) => c.connect()))
    const sauvegardes = await Promise.all(
      clients.map(async (c) => {
        await c.query('begin; set local role porteur_lien')
        await c.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'porteur_lien', role_partie: 'garant', dossier_id: dossier, jti }),
        ])
        const { rows } = await c.query('select sauver_brouillon_engagement($1,0,null) r', [
          Buffer.alloc(64, 1),
        ])
        await c.query('commit')
        return rows[0].r
      }),
    )
    assert.equal(
      sauvegardes.filter(Boolean).length,
      1,
      'Une seule sauvegarde gagne la revision initiale',
    )
    assert.equal(
      (
        await db.query('select count(*)::int n from brouillons_engagement where dossier_id=$1', [
          dossier,
        ])
      ).rows[0].n,
      1,
    )
    await db.query("update dossiers set statut='transmis' where id=$1", [dossier])
    assert.equal(
      (
        await db.query('select count(*)::int n from brouillons_engagement where dossier_id=$1', [
          dossier,
        ])
      ).rows[0].n,
      0,
    )
    console.log('OK : brouillons, sauvegardes concurrentes et destruction apres transmission')
  } finally {
    await Promise.allSettled(clients.map((c) => c.end()))
    await db.query('delete from dossiers where id=$1', [dossier])
  }
}
