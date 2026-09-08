import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

export async function verifierConcurrenceAdministrateurs(connexion) {
  const url = new URL(connexion)
  assert(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.pathname === '/cloison_audit_test' &&
      !url.search,
    'Base locale jetable obligatoire',
  )
  const a = new Client({ connectionString: connexion, connectionTimeoutMillis: 5000 })
  const b = new Client({ connectionString: connexion, connectionTimeoutMillis: 5000 })
  const agence = randomUUID(),
    premier = randomUUID(),
    second = randomUUID()
  let attente
  try {
    await a.connect()
    await b.connect()
    for (const c of [a, b])
      await c.query("set statement_timeout='5s'; set idle_in_transaction_session_timeout='15s'")
    await a.query('insert into public.agences(id,nom,domaine) values ($1,$2,$3)', [
      agence,
      'Concurrence',
      `${agence}.invalid`,
    ])
    await a.query(
      'insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now()),($3,$4,now())',
      [premier, `a@${agence}.invalid`, second, `b@${agence}.invalid`],
    )
    await a.query(
      "insert into public.membres_agence(agence_id,utilisateur_id,role) values ($1,$2,'admin'),($1,$3,'admin')",
      [agence, premier, second],
    )
    const pidA = (await a.query('select pg_backend_pid() as pid')).rows[0].pid
    const pidB = (await b.query('select pg_backend_pid() as pid')).rows[0].pid
    for (const isolation of ['read committed', 'repeatable read']) {
      await a.query("update public.membres_agence set role='admin' where agence_id=$1", [agence])
      for (const [c, sub] of [
        [a, premier],
        [b, second],
      ]) {
        await c.query(`begin isolation level ${isolation}`)
        await c.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub, aal: 'aal2' }),
        ])
        await c.query('set local role authenticated')
      }
      // Fixer l'instantane de B avant la modification de A en Repeatable Read.
      assert.equal(
        (await b.query("select count(*)::int as n from public.membres_agence where role='admin'"))
          .rows[0].n,
        2,
      )
      await a.query("update public.membres_agence set role='membre' where utilisateur_id=$1", [
        premier,
      ])
      attente = b
        .query("update public.membres_agence set role='membre' where utilisateur_id=$1", [second])
        .then(
          () => null,
          (e) => e.code,
        )
      await a.query('reset role')
      let bloque = false
      const limite = Date.now() + 3000
      while (Date.now() < limite) {
        const { rows } = await a.query('select pg_blocking_pids($1) as bloqueurs', [pidB])
        if (rows[0].bloqueurs.includes(pidA)) {
          bloque = true
          break
        }
        await new Promise((r) => setTimeout(r, 20))
      }
      assert(bloque, 'La seconde retrogradation doit attendre la premiere')
      await a.query('commit')
      assert.equal(await attente, isolation === 'read committed' ? '23514' : '40001')
      await b.query('rollback')
      assert.equal(
        (
          await a.query(
            "select count(*)::int as n from public.membres_agence where agence_id=$1 and role='admin'",
            [agence],
          )
        ).rows[0].n,
        1,
      )
    }
  } finally {
    await a.query('rollback').catch(() => {})
    if (attente) await attente
    await b.query('rollback').catch(() => {})
    await a.query('delete from public.agences where id=$1', [agence]).catch(() => {})
    await a
      .query('delete from auth.users where id=any($1::uuid[])', [[premier, second]])
      .catch(() => {})
    await Promise.allSettled([a.end(), b.end()])
  }
}
