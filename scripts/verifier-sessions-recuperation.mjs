import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'

export async function verifierSessionsRecuperation(db, adresse, secret) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  assert(['127.0.0.1', 'localhost'].includes(new URL(adresse).hostname))
  const agence = randomUUID(),
    user = randomUUID(),
    ancien = randomUUID(),
    actuel = randomUUID(),
    suivant = randomUUID()
  await db.query(
    "insert into agences(id,nom,domaine) values($1,'Recuperation HTTP','recuperation.invalid')",
    [agence],
  )
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'recette@recuperation.invalid',now())",
    [user],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, user],
  )
  await db.query(
    "insert into auth.sessions(id,user_id,aal,created_at) values($1,$3,'aal2',now()-interval '2 days'),($2,$3,'aal2',now()-interval '1 day')",
    [ancien, actuel, user],
  )
  async function appel(session, route, amr = [{ method: 'mfa/recovery_code' }]) {
    const token = await new SignJWT({
      role: 'authenticated',
      sub: user,
      aal: 'aal2',
      session_id: session,
      amr,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret))
    const r = await fetch(`${adresse}/rpc/${route}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(r.status, 200)
    return r.json()
  }
  assert.equal(await appel(ancien, 'agence_courante'), agence)
  assert.equal(await appel(actuel, 'revoquer_sessions_apres_recuperation', []), false)
  assert.equal(await appel(actuel, 'revoquer_sessions_apres_recuperation'), true)
  assert.equal(await appel(actuel, 'agence_courante'), agence)
  assert.equal(await appel(ancien, 'agence_courante'), null)
  assert.equal(await appel(ancien, 'revoquer_sessions_apres_recuperation'), false)
  await db.query("insert into auth.sessions(id,user_id,aal) values($1,$2,'aal2')", [suivant, user])
  assert.equal(await appel(suivant, 'agence_courante'), agence)
  await db.query('delete from auth.sessions where id=$1', [actuel])
  assert.equal(await appel(actuel, 'agence_courante'), null)
  console.log('OK : recuperation HTTP, ancien JWT refuse et session supprimee refusee')
}
