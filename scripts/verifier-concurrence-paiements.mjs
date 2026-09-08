import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
const indexSql =
  'create unique index paiement_fournisseur_credite_unique on public.registre_paiements(reference_paiement) where marque and reference_paiement is not null'
export async function verifierConcurrencePaiements(connexion) {
  const url = new URL(connexion)
  assert(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.pathname === '/cloison_audit_test' &&
      !url.search,
    'Base locale jetable obligatoire',
  )
  const a = new Client({ connectionString: connexion, connectionTimeoutMillis: 5000 }),
    b = new Client({ connectionString: connexion, connectionTimeoutMillis: 5000 })
  await a.connect()
  await b.connect()
  async function exercice(isolation) {
    const ids = [randomUUID(), randomUUID()],
      suffixe = randomUUID().replaceAll('-', '')
    const sessions = [`cs_a_${suffixe}`, `cs_b_${suffixe}`],
      events = [`evt_a_${suffixe}`, `evt_b_${suffixe}`],
      pi = `pi_${suffixe}`
    let attente
    try {
      for (const c of [a, b])
        await c.query("set statement_timeout='5s'; set idle_in_transaction_session_timeout='15s'")
      await a.query(
        "insert into dossiers(id,email_locataire) values ($1,'a@example.invalid'),($2,'b@example.invalid')",
        ids,
      )
      const pidA = (await a.query('select pg_backend_pid() as pid')).rows[0].pid,
        pidB = (await b.query('select pg_backend_pid() as pid')).rows[0].pid
      for (const c of [a, b]) {
        await c.query(`begin isolation level ${isolation}`)
        await c.query('set local role serveur')
      }
      await b.query('select public.etat_paiements()')
      const appel = (c, i) =>
        c.query(
          "select public.enregistrer_paiement_locataire($1,$2,$3,$4,900,'eur','locataire-2026-09-04','2026-01-01') as resultat",
          [events[i], sessions[i], pi, ids[i]],
        )
      assert.equal((await appel(a, 0)).rows[0].resultat.marque, true)
      attente = appel(b, 1).then(
        (r) => ({ resultat: r.rows[0].resultat }),
        (e) => ({ code: e.code }),
      )
      await a.query('reset role')
      let bloque = false
      const limite = Date.now() + 3000
      while (Date.now() < limite) {
        if (
          (await a.query('select pg_blocking_pids($1) as pids', [pidB])).rows[0].pids.includes(pidA)
        ) {
          bloque = true
          break
        }
        await new Promise((r) => setTimeout(r, 20))
      }
      assert(bloque, 'Le paiement concurrent doit attendre')
      await a.query('commit')
      const seconde = await attente
      if (isolation === 'repeatable read') {
        assert.equal(
          seconde.code,
          '23505',
          'La contrainte doit refuser le second credit avec instantane ancien',
        )
        await b.query('rollback;set role serveur')
        assert.equal((await appel(b, 1)).rows[0].resultat.anomalie, true)
        await b.query('reset role')
      } else {
        assert.equal(seconde.resultat.anomalie, true)
        await b.query('commit')
      }
      assert.equal(
        (
          await a.query(
            'select count(*)::int n from dossiers where id=any($1::uuid[]) and paye_le is not null',
            [ids],
          )
        ).rows[0].n,
        1,
      )
    } finally {
      await a.query('rollback;reset role').catch(() => {})
      if (attente) await attente
      await b.query('rollback;reset role').catch(() => {})
      await a.query('delete from evenements_paiements where id=any($1::text[])', [events])
      await a.query('delete from registre_paiements where reference_session=any($1::text[])', [
        sessions,
      ])
      await a.query('delete from dossiers where id=any($1::uuid[])', [ids])
    }
  }
  try {
    await exercice('read committed')
    await exercice('repeatable read')
    await a.query('drop index public.paiement_fournisseur_credite_unique')
    try {
      await assert.rejects(
        exercice('repeatable read'),
        (e) => e.code === 'ERR_ASSERTION' && e.message.includes('contrainte doit refuser'),
        'Le sabotage du credit unique doit etre detecte',
      )
    } finally {
      await a.query(indexSql)
    }
  } finally {
    await Promise.allSettled([a.end(), b.end()])
  }
}
