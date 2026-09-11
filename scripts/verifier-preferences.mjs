import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { SignJWT } from 'jose'
export async function verifierPreferences(db, connexion, adresse, secret) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  assert(['127.0.0.1', 'localhost'].includes(new URL(adresse).hostname))
  await db.query("select set_config('request.jwt.claims','{}',false)")
  await db.query('begin')
  try {
    await db.query(readFileSync('supabase/essais/responsables.sql', 'utf8'))
    await db.query(readFileSync('supabase/essais/preferences-notifications.sql', 'utf8'))
  } finally {
    await db.query('rollback')
  }
  await db.query('begin')
  await db.query(
    readFileSync('supabase/essais/responsables.sql', 'utf8').split(
      'set local role authenticated;',
    )[0],
  )
  const f = (
    await db.query(
      "select current_setting('cloison.responsable_admin') acteur,current_setting('cloison.responsable_second') collegue",
    )
  ).rows[0]
  await db.query('commit')
  const definition = (
    await db.query(
      "select pg_get_functiondef('public.regler_notifications(text,uuid)'::regprocedure) texte",
    )
  ).rows[0].texte
  const garde = 'if courante is distinct from revision_attendue then return null;end if;'
  assert(definition.includes(garde))
  async function course() {
    await db.query('delete from preferences_notifications where utilisateur_id=$1', [f.acteur])
    const clients = [
      new Client({ connectionString: connexion }),
      new Client({ connectionString: connexion }),
    ]
    try {
      await Promise.all(clients.map((c) => c.connect()))
      return (
        await Promise.all(
          clients.map(async (c, i) => {
            await c.query('set role authenticated')
            await c.query("select set_config('request.jwt.claims',$1,false)", [
              JSON.stringify({ role: 'authenticated', sub: f.acteur, aal: 'aal2' }),
            ])
            return (await c.query('select regler_notifications($1,null) r', [i ? 'mes' : 'aucun']))
              .rows[0].r
          }),
        )
      ).filter(Boolean)
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  }
  assert.equal((await course()).length, 1, 'Preference concurrente ecrasee')
  try {
    await db.query(definition.replace(garde, ''))
    const sabote = await course()
    assert.equal(sabote.length, 2)
    assert.throws(() => assert.equal(sabote.length, 1, 'Preference concurrente ecrasee'), {
      code: 'ERR_ASSERTION',
    })
  } finally {
    await db.query(definition)
  }
  assert.equal((await course()).length, 1, 'Revision preference non restauree')
  async function lire(utilisateur) {
    const jwt = await new SignJWT({ role: 'authenticated', sub: utilisateur, aal: 'aal2' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret))
    const r = await fetch(new URL('/rpc/mes_preferences_notifications', adresse), {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(r.status, 200)
    return await r.json()
  }
  assert.deepEqual(await lire(f.collegue), [{ mode: 'tous', revision: null }])
  assert.notEqual((await lire(f.acteur))[0].revision, null)
  console.log(
    'OK : preferences, roles reels, projection personnelle et concurrence avec contre-preuve restauree',
  )
}
