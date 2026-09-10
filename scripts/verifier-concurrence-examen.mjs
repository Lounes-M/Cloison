import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

export async function verifierConcurrenceExamen(db, connexion) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  const fixture = readFileSync('supabase/essais/examen-documentaire.sql', 'utf8')
  await db.query('begin')
  try {
    await db.query(fixture)
  } finally {
    await db.query('rollback')
  }
  await db.query('begin')
  await db.query(fixture.split('set local role authenticated;')[0])
  const {
    rows: [f],
  } = await db.query(
    "select current_setting('cloison.examen_dossier') dossier,current_setting('cloison.examen_piece') piece,current_setting('cloison.examen_membre') membre",
  )
  await db.query('commit')
  const definition = (
    await db.query(
      "select pg_get_functiondef('public.enregistrer_examen_documentaire(uuid,uuid,text,uuid)'::regprocedure) texte",
    )
  ).rows[0].texte
  const garde = 'if derniere is distinct from revision_attendue then return null;end if;'
  assert(definition.includes(garde))
  async function deuxExamens() {
    await db.query('delete from examens_documentaires where piece_id=$1', [f.piece])
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
              JSON.stringify({ role: 'authenticated', sub: f.membre, aal: 'aal2' }),
            ])
            return (
              await c.query('select enregistrer_examen_documentaire($1,$2,$3,null) id', [
                f.dossier,
                f.piece,
                i ? 'a_revoir' : 'examine',
              ])
            ).rows[0].id
          }),
        )
      ).filter(Boolean)
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  }
  assert.equal((await deuxExamens()).length, 1, 'Examen recent ecrase')
  try {
    await db.query(definition.replace(garde, ''))
    const sabote = await deuxExamens()
    assert.equal(sabote.length, 2, 'Contre-preuve examen non reproduite')
    assert.throws(() => assert.equal(sabote.length, 1, 'Examen recent ecrase'), {
      code: 'ERR_ASSERTION',
    })
  } finally {
    await db.query(definition)
  }
  assert.equal((await deuxExamens()).length, 1, 'Revision examen non restauree')
  await verifierExpirationPendantAttente(db, connexion, fixture, definition)
  console.log('OK : examen humain, roles reels, conflit concurrent, contre-preuve et restauration')
}

async function verifierExpirationPendantAttente(db, connexion, fixture, definition) {
  const garde = 'where d.id=le_dossier and d.expire_le>clock_timestamp() returning revision'
  assert(definition.includes(garde))
  async function course() {
    await db.query('begin')
    await db.query(fixture.split('set local role authenticated;')[0])
    const {
      rows: [f],
    } = await db.query(
      "select current_setting('cloison.examen_dossier') dossier,current_setting('cloison.examen_piece') piece,current_setting('cloison.examen_membre') membre",
    )
    await db.query(
      "update dossiers set expire_le=clock_timestamp()+interval '3 seconds' where id=$1",
      [f.dossier],
    )
    await db.query('commit')
    const client = new Client({ connectionString: connexion })
    let resultat
    try {
      await client.connect()
      await db.query('begin')
      await db.query('select id from dossiers where id=$1 for update', [f.dossier])
      await client.query('set role authenticated')
      await client.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ role: 'authenticated', sub: f.membre, aal: 'aal2' }),
      ])
      resultat = client
        .query('select enregistrer_examen_documentaire($1,$2,$3,null) id', [
          f.dossier,
          f.piece,
          'examine',
        ])
        .then(
          (r) => ({ id: r.rows[0].id }),
          () => ({ erreur: true }),
        )
      let bloque = false
      for (let i = 0; i < 100; i++) {
        const {
          rows: [r],
        } = await db.query('select $1::integer=any(pg_blocking_pids($2::integer)) bloque', [
          db.processID,
          client.processID,
        ])
        if (r.bloque) {
          bloque = true
          break
        }
        await new Promise((r) => setTimeout(r, 10))
      }
      assert(bloque, 'Examen non bloque avant expiration')
      await db.query(
        'select pg_sleep(greatest(0,extract(epoch from (expire_le-clock_timestamp())))+0.05) from dossiers where id=$1',
        [f.dossier],
      )
      await db.query('commit')
      const r = await resultat
      assert(!r.erreur, 'Examen apres attente en erreur')
      return r.id
    } finally {
      await db.query('rollback')
      if (resultat) await resultat
      await client.end()
    }
  }
  assert.equal(await course(), null, 'Examen accepte apres expiration pendant attente')
  try {
    await db.query(definition.replace(garde, 'where d.id=le_dossier returning revision'))
    const sabote = await course()
    assert(sabote, 'Contre-preuve expiration non reproduite')
    assert.throws(
      () => assert.equal(sabote, null, 'Examen accepte apres expiration pendant attente'),
      { code: 'ERR_ASSERTION' },
    )
  } finally {
    await db.query(definition)
  }
  assert.equal(await course(), null, 'Controle expiration non restaure')
  console.log('OK : examen refuse apres expiration pendant attente, contre-preuve et restauration')
}
