import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
export async function verifierHttpConnecteurs(db, site) {
  assert(['127.0.0.1', 'localhost'].includes(new URL(site).hostname))
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  const cle = `cloison_read_${randomBytes(32).toString('base64url')}`,
    hash = createHash('sha256').update(cle).digest('hex')
  await db.query('begin')
  try {
    await db.query(
      readFileSync('supabase/essais/connecteurs.sql', 'utf8').split(
        'set local role authenticated;',
      )[0],
    )
    await db.query('set local role authenticated')
    const {
      rows: [r],
    } = await db.query('select creer_connecteur($1,$2) id', ['HTTP fictif', hash])
    const {
      rows: [reference],
    } = await db.query("select current_setting('cloison.connecteur_reference') reference")
    await db.query('commit')
    const url = new URL('/api/connecteurs/v1/dossiers', site)
    assert.equal((await fetch(url)).status, 401)
    const reponse = await fetch(url, {
      headers: { Authorization: `Bearer ${cle}` },
      signal: AbortSignal.timeout(10000),
    })
    assert.equal(reponse.status, 200)
    assert.equal(reponse.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await reponse.json(), {
      version: 1,
      dossiers: [{ reference: reference.reference, etat: 'a_completer' }],
      suite: null,
    })
    await db.query('update connecteurs_agence set revoque_le=clock_timestamp() where id=$1', [r.id])
    assert.equal(
      (
        await fetch(url, {
          headers: { Authorization: `Bearer ${cle}` },
          signal: AbortSignal.timeout(10000),
        })
      ).status,
      401,
    )
    console.log(
      'OK : connecteur via Next et PostgREST, projection exacte, refus anonyme et revocation',
    )
  } finally {
    await db.query('rollback')
  }
}
