import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { Client } from 'pg'

// Base locale jetable controlee par test-postgrest. Aucun compte ou secret reel.
export async function verifierConcurrenceConnecteurs(db, connexion) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  await db.query('begin')
  try {
    await db.query(readFileSync('supabase/essais/connecteurs.sql', 'utf8'))
  } finally {
    await db.query('rollback')
  }
  await db.query('begin')
  await db.query(
    readFileSync('supabase/essais/connecteurs.sql', 'utf8').split(
      'set local role authenticated;',
    )[0],
  )
  const {
    rows: [f],
  } = await db.query(
    "select current_setting('cloison.connecteur_membre') membre,current_setting('cloison.connecteur_hash') empreinte,current_setting('cloison.connecteur_agence') agence",
  )
  await db.query('set local role authenticated')
  const {
    rows: [cle],
  } = await db.query('select creer_connecteur($1,$2) id', ['Concurrence fictive', f.empreinte])
  await db.query('commit')
  const second = randomUUID()
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) select $1,'second@'||domaine,now() from agences where id=$2",
    [second, f.agence],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [f.agence, second],
  )
  for (let i = 0; i < 3; i++)
    await db.query(
      'insert into connecteurs_agence(agence_id,nom,empreinte,cree_par) values($1,$2,$3,$4)',
      [f.agence, 'Fixture concurrence', randomBytes(32).toString('hex'), f.membre],
    )
  async function deuxCreations() {
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
              JSON.stringify({ role: 'authenticated', sub: i ? second : f.membre, aal: 'aal2' }),
            ])
            return (
              await c.query('select creer_connecteur($1,$2) id', [
                'Concurrence fictive',
                randomBytes(32).toString('hex'),
              ])
            ).rows[0].id
          }),
        )
      ).filter(Boolean)
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  }
  async function deuxLectures() {
    // Eviter qu'un changement legitime de minute brouille cette preuve.
    const position = Date.now() % 60000
    if (position > 57500) await new Promise((r) => setTimeout(r, 60100 - position))
    await db.query(
      "update connecteurs_agence set fenetre=date_bin(interval '1 minute',clock_timestamp(),timestamptz 'epoch'),compte=59 where id=$1",
      [cle.id],
    )
    const clients = [
      new Client({ connectionString: connexion }),
      new Client({ connectionString: connexion }),
    ]
    try {
      await Promise.all(clients.map((c) => c.connect()))
      return await Promise.all(
        clients.map(async (c) => {
          await c.query('set role serveur')
          return (await c.query('select lire_statuts_connecteur($1) r', [f.empreinte])).rows[0].r
        }),
      )
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  }
  const definition = (
    await db.query(
      "select pg_get_functiondef('public.lire_statuts_connecteur(text,text)'::regprocedure) texte",
    )
  ).rows[0].texte
  assert(definition.includes('for update;'))
  const definitionCreation = (
    await db.query(
      "select pg_get_functiondef('public.creer_connecteur(text,text)'::regprocedure) texte",
    )
  ).rows[0].texte
  assert(definitionCreation.includes('for update;'))
  await db.query(
    'create function retard_connecteur_essai() returns trigger language plpgsql as $$begin perform pg_sleep(0.15);return new;end;$$;create trigger retard_connecteur_essai before insert or update on connecteurs_agence for each row execute function retard_connecteur_essai()',
  )
  try {
    const creationNormale = await deuxCreations()
    assert.equal(creationNormale.length, 1, 'Plafond de cles concurrent depasse')
    await db.query('delete from connecteurs_agence where id=any($1::uuid[])', [creationNormale])
    await db.query(definitionCreation.replace('where id=agence for update;', 'where id=agence;'))
    const creationSabotee = await deuxCreations()
    assert.equal(creationSabotee.length, 2, 'Contre-preuve des creations non reproduite')
    assert.throws(
      () => assert.equal(creationSabotee.length, 1, 'Plafond de cles concurrent depasse'),
      { code: 'ERR_ASSERTION' },
    )
    await db.query('delete from connecteurs_agence where id=any($1::uuid[])', [creationSabotee])
    await db.query(definitionCreation)
    assert.equal((await deuxCreations()).length, 1, 'Verrou de creation non restaure')
    const normal = await deuxLectures()
    assert.equal(
      normal.filter((r) => r?.version === 1).length,
      1,
      'Quota connecteur concurrent depasse',
    )
    assert.equal(normal.filter((r) => r?.limite === true).length, 1)
    await db.query(definition.replace('for update;', ';'))
    const sabote = await deuxLectures()
    const acceptes = sabote.filter((r) => r?.version === 1).length
    assert.equal(acceptes, 2, 'Contre-preuve concurrente non reproduite')
    assert.throws(() => assert.equal(acceptes, 1, 'Quota connecteur concurrent depasse'), {
      code: 'ERR_ASSERTION',
    })
  } finally {
    await db.query(definition)
    await db.query(definitionCreation)
    await db.query(
      'drop trigger retard_connecteur_essai on connecteurs_agence;drop function retard_connecteur_essai()',
    )
  }
  assert.equal(
    (await deuxLectures()).filter((r) => r?.version === 1).length,
    1,
    'Verrou non restaure',
  )
  await verifierExclusionConcurrente(db, connexion, definitionCreation)
  console.log(
    'OK : connecteurs, roles reels, quotas de cles et lectures concurrents, deux contre-preuves sans verrou et restauration',
  )
}

async function verifierExclusionConcurrente(db, connexion, definition) {
  const verrou =
    "perform 1 from public.membres_agence where agence_id=agence and utilisateur_id=auth.uid() and role='admin' for update;\n if not found then return null;end if;"
  assert(definition.includes(verrou))
  async function course() {
    await db.query('begin')
    await db.query(
      readFileSync('supabase/essais/connecteurs.sql', 'utf8').split(
        'set local role authenticated;',
      )[0],
    )
    const {
      rows: [f],
    } = await db.query(
      "select current_setting('cloison.connecteur_membre') membre,current_setting('cloison.connecteur_agence') agence",
    )
    const second = randomUUID()
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) select $1,'second@'||domaine,now() from agences where id=$2",
      [second, f.agence],
    )
    await db.query(
      "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
      [f.agence, second],
    )
    await db.query('commit')
    const retrait = new Client({ connectionString: connexion }),
      creation = new Client({ connectionString: connexion })
    let resultat
    try {
      await retrait.connect()
      await creation.connect()
      await retrait.query('begin')
      await retrait.query('delete from membres_agence where agence_id=$1 and utilisateur_id=$2', [
        f.agence,
        f.membre,
      ])
      await creation.query('set role authenticated')
      await creation.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ role: 'authenticated', sub: f.membre, aal: 'aal2' }),
      ])
      resultat = creation
        .query('select creer_connecteur($1,$2) id', [
          'Course exclusion',
          randomBytes(32).toString('hex'),
        ])
        .then(
          (r) => ({ id: r.rows[0].id }),
          () => ({ erreur: true }),
        )
      let bloque = false
      for (let i = 0; i < 150; i++) {
        const {
          rows: [r],
        } = await db.query('select $1::integer=any(pg_blocking_pids($2::integer)) bloque', [
          retrait.processID,
          creation.processID,
        ])
        if (r.bloque) {
          bloque = true
          break
        }
        await new Promise((r) => setTimeout(r, 20))
      }
      assert(bloque, 'Course exclusion non synchronisee')
      await retrait.query('commit')
      const r = await resultat
      assert(!r.erreur, 'Course exclusion en erreur')
      return r.id
    } finally {
      await retrait.query('rollback').catch(() => {})
      if (resultat) await resultat
      await Promise.all([retrait.end(), creation.end()])
    }
  }
  assert.equal(await course(), null, 'Cle creee apres exclusion')
  try {
    await db.query(definition.replace(verrou, ''))
    const sabote = await course()
    assert(sabote, 'Contre-preuve exclusion non reproduite')
    assert.throws(() => assert.equal(sabote, null, 'Cle creee apres exclusion'), {
      code: 'ERR_ASSERTION',
    })
  } finally {
    await db.query(definition)
  }
  assert.equal(await course(), null, 'Verrou exclusion non restaure')
  console.log('OK : exclusion concurrente, contre-preuve de creation tardive et restauration')
}
