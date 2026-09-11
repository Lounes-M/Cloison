import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
export async function verifierRappels(db, connexion) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  await db.query('begin')
  try {
    await db.query(readFileSync('supabase/essais/rappels.sql', 'utf8'))
  } finally {
    await db.query('rollback')
  }
  await db.query('begin')
  await db.query(
    readFileSync('supabase/essais/rappels.sql', 'utf8').split('set local role authenticated;')[0],
  )
  const f = (
    await db.query(
      "select current_setting('cloison.responsable_admin') acteur,current_setting('cloison.responsable_agence') agence,current_setting('cloison.responsable_dossier') dossier",
    )
  ).rows[0]
  await db.query('commit')
  const definition = (
    await db.query("select pg_get_functiondef('public.programmer_rappels()'::regprocedure) texte")
  ).rows[0].texte
  const verrou = 'perform pg_advisory_xact_lock(525200,1);'
  const point = 'if total>=200 then return 0;end if;'
  assert(definition.includes(verrou) && definition.includes(point))
  const instrumentation = definition.replace(
    point,
    `perform pg_advisory_xact_lock(525200,2);\n ${point}`,
  )
  const autre = (
    await db.query(
      "insert into agences(nom,domaine) values('Quota natif','quota-natif.invalid') returning id",
    )
  ).rows[0].id
  const dossierQuota = (
    await db.query(
      "insert into dossiers(agence_id,email_locataire,loyer_cents) values($1,'quota@example.invalid',100000) returning id",
      [autre],
    )
  ).rows[0].id
  await db.query('insert into reglages_rappels(agence_id,relance_jours) values($1,3)', [f.agence])
  await db.query(
    "insert into dossiers(agence_id,email_locataire,email_garant,loyer_cents,activite_rappel_le,expire_le) values($1,'quota@example.invalid','garant@example.invalid',100000,now()-interval '8 days',now()+interval '2 days')",
    [f.agence],
  )
  async function course() {
    await db.query('delete from rappels_dossiers where agence_id=any($1::uuid[])', [
      [f.agence, autre],
    ])
    await db.query(
      "insert into rappels_dossiers(cle,dossier_id,agence_id,nature,revision_dossier,empreinte_email,expiration_dossier,expire_le) select encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),$1,$2,'echeance',gen_random_uuid(),repeat('a',64),now()+interval '2 days',now()+interval '1 day' from generate_series(1,199)",
      [dossierQuota, autre],
    )
    const clients = [
      new Client({ connectionString: connexion }),
      new Client({ connectionString: connexion }),
    ]
    let resultats = []
    await db.query('select pg_advisory_lock(525200,2)')
    try {
      await Promise.all(clients.map((c) => c.connect()))
      await Promise.all(clients.map((c) => c.query("set statement_timeout='8s';set role serveur")))
      const pids = (
        await Promise.all(clients.map((c) => c.query('select pg_backend_pid() pid')))
      ).map((r) => r.rows[0].pid)
      const appels = clients.map((c) => c.query('select programmer_rappels() n'))
      let bloques = false
      for (let i = 0; i < 100; i++) {
        const n = (
          await db.query(
            "select count(*)::integer n from pg_stat_activity where pid=any($1::integer[]) and wait_event='advisory'",
            [pids],
          )
        ).rows[0].n
        if (n === 2) {
          bloques = true
          break
        }
        await new Promise((r) => setTimeout(r, 20))
      }
      await db.query('select pg_advisory_unlock(525200,2)')
      resultats = await Promise.all(appels)
      assert(bloques, 'Course non synchronisee sur les verrous reels')
      return resultats.reduce((n, r) => n + r.rows[0].n, 199)
    } finally {
      await db.query('select pg_advisory_unlock(525200,2)')
      await Promise.all(clients.map((c) => c.end()))
    }
  }
  try {
    await db.query(instrumentation)
    assert.equal(await course(), 200, 'Quota global concurrent depasse')
    await db.query(instrumentation.replace(verrou, ''))
    const sabote = await course()
    assert.equal(sabote, 201)
    assert.throws(() => assert.equal(sabote, 200, 'Quota global concurrent depasse'), {
      code: 'ERR_ASSERTION',
    })
    await db.query(instrumentation)
    assert.equal(await course(), 200, 'Quota global concurrent depasse')
  } finally {
    await db.query(definition)
    await db.query('delete from dossiers where agence_id=any($1::uuid[])', [[f.agence, autre]])
    const utilisateurs = (
      await db.query('select utilisateur_id from membres_agence where agence_id=$1', [f.agence])
    ).rows.map((r) => r.utilisateur_id)
    // La suppression du parent autorise la cascade du dernier administrateur.
    await db.query('delete from agences where id=any($1::uuid[])', [[f.agence, autre]])
    await db.query('delete from auth.users where id=any($1::uuid[])', [utilisateurs])
  }
  assert.equal(
    (await db.query("select pg_get_functiondef('public.programmer_rappels()'::regprocedure) texte"))
      .rows[0].texte,
    definition,
  )
  console.log(
    'OK : rappels PostgreSQL, droits reels, bail obsolete et quota concurrent vu rouge puis restaure',
  )
}
