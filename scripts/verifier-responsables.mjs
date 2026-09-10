import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { SignJWT } from 'jose'

export async function verifierResponsables(db, connexion, adresse, secret) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  assert(['127.0.0.1', 'localhost'].includes(new URL(adresse).hostname))
  await db.query("select set_config('request.jwt.claims','{}',false)")
  const fixture = readFileSync('supabase/essais/responsables.sql', 'utf8')
  await db.query('begin')
  try {
    await db.query(fixture)
  } finally {
    await db.query('rollback')
  }
  async function creerFixture() {
    await db.query('begin')
    await db.query(fixture.split('set local role authenticated;')[0])
    const {
      rows: [f],
    } = await db.query(
      "select current_setting('cloison.responsable_agence') agence,current_setting('cloison.responsable_dossier') dossier,current_setting('cloison.responsable_admin') admin,current_setting('cloison.responsable_premier') premier,current_setting('cloison.responsable_second') second",
    )
    await db.query('commit')
    return f
  }
  const f = await creerFixture()
  async function devenir(c, u) {
    await c.query('set role authenticated')
    await c.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role: 'authenticated', sub: u, aal: 'aal2' }),
    ])
  }
  const definition = (
    await db.query(
      "select pg_get_functiondef('public.affecter_dossier(uuid,uuid,uuid)'::regprocedure) texte",
    )
  ).rows[0].texte
  const revision =
    'if courante.revision is distinct from revision_attendue then return null;end if;'
  assert(definition.includes(revision))
  async function deuxAffectations() {
    await db.query('delete from affectations_dossiers where dossier_id=$1', [f.dossier])
    const clients = [
      new Client({ connectionString: connexion }),
      new Client({ connectionString: connexion }),
    ]
    try {
      await Promise.all(clients.map((c) => c.connect()))
      return (
        await Promise.all(
          clients.map(async (c, i) => {
            await devenir(c, f.admin)
            return (
              await c.query('select affecter_dossier($1,$2,null) id', [
                f.dossier,
                i ? f.second : f.premier,
              ])
            ).rows[0].id
          }),
        )
      ).filter(Boolean)
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  }
  assert.equal((await deuxAffectations()).length, 1, 'Affectation recente ecrasee')
  try {
    await db.query(definition.replace(revision, ''))
    const sabote = await deuxAffectations()
    assert.equal(sabote.length, 2, 'Contre-preuve revision non reproduite')
    assert.throws(() => assert.equal(sabote.length, 1, 'Affectation recente ecrasee'), {
      code: 'ERR_ASSERTION',
    })
  } finally {
    await db.query(definition)
  }
  assert.equal((await deuxAffectations()).length, 1, 'Revision non restauree')

  async function exclusion() {
    const e = await creerFixture(),
      retrait = new Client({ connectionString: connexion }),
      affectation = new Client({ connectionString: connexion })
    let resultat,
      fini = false
    try {
      await retrait.connect()
      await affectation.connect()
      await retrait.query('begin')
      await retrait.query('delete from membres_agence where utilisateur_id=$1', [e.premier])
      await devenir(affectation, e.admin)
      resultat = affectation
        .query('select affecter_dossier($1,$2,null) id', [e.dossier, e.premier])
        .then(
          (r) => {
            fini = true
            return { id: r.rows[0].id }
          },
          () => {
            fini = true
            return { erreur: true }
          },
        )
      let bloque = false
      for (let i = 0; i < 200 && !fini; i++) {
        const {
          rows: [r],
        } = await db.query('select $1::integer=any(pg_blocking_pids($2::integer)) bloque', [
          retrait.processID,
          affectation.processID,
        ])
        if (r.bloque) {
          bloque = true
          break
        }
        await new Promise((r) => setTimeout(r, 10))
      }
      assert(bloque || fini, 'Course exclusion non observee')
      await retrait.query('commit')
      const r = await resultat
      assert(!r.erreur, 'Affectation concurrente en erreur')
      return r.id
    } finally {
      await retrait.query('rollback').catch(() => {})
      if (resultat) await resultat
      await Promise.all([retrait.end(), affectation.end()])
    }
  }
  assert.equal(await exclusion(), null, 'Affectation apres exclusion')
  assert(definition.includes('for key share of m;'))
  try {
    await db.query(definition.replace('for key share of m;', ';'))
    const sabote = await exclusion()
    assert(sabote, 'Contre-preuve exclusion non reproduite')
    assert.throws(() => assert.equal(sabote, null, 'Affectation apres exclusion'), {
      code: 'ERR_ASSERTION',
    })
  } finally {
    await db.query(definition)
  }
  assert.equal(await exclusion(), null, 'Verrou du membre non restaure')

  // Vraie pagination PostgREST, avec un dossier attribue plus ancien que 52 autres.
  const filtre = await creerFixture()
  await db.query(
    "update dossiers set cree_le=clock_timestamp()-interval '1 day',expire_le=clock_timestamp()+interval '1 day' where id=$1",
    [filtre.dossier],
  )
  await db.query('insert into affectations_dossiers(dossier_id,membre_id) values($1,$2)', [
    filtre.dossier,
    filtre.premier,
  ])
  for (let i = 0; i < 53; i++) {
    const id = randomUUID()
    await db.query(
      "insert into dossiers(id,agence_id,email_locataire) values($1,$2,'filtre@example.invalid')",
      [id, filtre.agence],
    )
    if (i === 0)
      await db.query('insert into affectations_dossiers(dossier_id,membre_id) values($1,$2)', [
        id,
        filtre.second,
      ])
    if (i === 1)
      await db.query('insert into affectations_dossiers(dossier_id,membre_id) values($1,null)', [
        id,
      ])
  }
  const jeton = await new SignJWT({ role: 'authenticated', sub: filtre.premier, aal: 'aal2' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))
  async function demander(mode, offset = 0) {
    const url = new URL('/dossiers', adresse)
    url.searchParams.set('select', 'id,affecte:affectations_dossiers()')
    url.searchParams.set('order', 'cree_le.desc,id.desc')
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('limit', '51')
    if (mode === 'mes') {
      url.searchParams.set('affecte.membre_id', `eq.${filtre.premier}`)
      url.searchParams.set('affecte', 'not.is.null')
    }
    if (mode === 'sans') {
      url.searchParams.set('affecte.membre_id', 'not.is.null')
      url.searchParams.set('affecte', 'is.null')
    }
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(r.status, 200, 'Filtre PostgREST refuse')
    return (await r.json()).map((d) => d.id)
  }
  assert.deepEqual(await demander('mes'), [filtre.dossier])
  const attendus = (
    await db.query(
      'select d.id from dossiers d left join affectations_dossiers f on f.dossier_id=d.id where d.agence_id=$1 and f.membre_id is null order by d.cree_le desc,d.id desc',
      [filtre.agence],
    )
  ).rows.map((r) => r.id)
  assert.equal(attendus.length, 52)
  assert.deepEqual(await demander('sans'), attendus.slice(0, 51))
  assert.deepEqual(await demander('sans', 50), attendus.slice(50))
  const sansFiltre = await demander('tous')
  assert.throws(() => assert.deepEqual(sansFiltre, [filtre.dossier]), { code: 'ERR_ASSERTION' })
  const suiteSansFiltre = await demander('tous', 50)
  assert.throws(() => assert.deepEqual(suiteSansFiltre, attendus.slice(50)), {
    code: 'ERR_ASSERTION',
  })
  console.log(
    'OK : responsables, roles reels, deux courses et contre-preuves, filtres PostgREST sur plus de cinquante dossiers',
  )
}
