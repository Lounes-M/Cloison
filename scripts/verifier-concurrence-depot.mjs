import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

/** Deux connexions PostgreSQL reelles, exclusivement sur une base locale jetable. */
export async function verifierConcurrenceDepot(connexion) {
  const url = new URL(connexion)
  assert(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.pathname === '/cloison_audit_test' &&
      !url.search,
    'Base locale jetable cloison_audit_test obligatoire, sans options URL',
  )
  const config = { connectionString: connexion, connectionTimeoutMillis: 5000 }
  const a = new Client(config)
  const b = new Client(config)
  const dossiers = []
  let attente
  let connecteA = false,
    connecteB = false
  try {
    await a.connect()
    connecteA = true
    await b.connect()
    connecteB = true
    for (const client of [a, b]) {
      await client.query(
        "set statement_timeout='5s'; set idle_in_transaction_session_timeout='15s'",
      )
    }
    const pidA = (await a.query('select pg_backend_pid() as pid')).rows[0].pid
    const pidB = (await b.query('select pg_backend_pid() as pid')).rows[0].pid
    async function fixture(avecObjet = true) {
      const id = randomUUID(),
        jti = randomUUID(),
        chemin = `${id}/${randomUUID()}`
      dossiers.push(id)
      await a.query(
        "insert into dossiers(id,email_locataire) values ($1,'concurrence@example.invalid')",
        [id],
      )
      await a.query(
        "insert into jetons_actifs(dossier_id,partie,jti,expire_le) values ($1,'garant',$2,now()+interval '1 hour')",
        [id, jti],
      )
      if (avecObjet) {
        await a.query('insert into reservations_depot(chemin,dossier_id) values ($1,$2)', [
          chemin,
          id,
        ])
        await a.query("insert into storage.objects(bucket_id,name) values ('pieces',$1)", [chemin])
      }
      return { id, jti, chemin }
    }
    async function commencer(client, f, role = 'depot_piece') {
      await client.query('begin')
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          role,
          role_partie: 'garant',
          dossier_id: f.id,
          jti: f.jti,
        }),
      ])
      assert(['porteur_lien', 'depot_piece'].includes(role))
      await client.query(`set local role ${role}`)
    }
    const inscrire = (client, f) =>
      client.query(
        "insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values ($1,'bulletin_paie',$2,100,'application/pdf')",
        [f.id, f.chemin],
      )
    const abandonner = (client, f) =>
      client.query('select programmer_suppression_objet($1)', [f.chemin])
    async function constaterAttente() {
      const limite = Date.now() + 3000
      while (Date.now() < limite) {
        const { rows } = await a.query(
          'select wait_event_type, pg_blocking_pids(pid) as bloqueurs from pg_stat_activity where pid=$1',
          [pidB],
        )
        if (rows[0]?.wait_event_type === 'Lock' && rows[0].bloqueurs.includes(pidA)) return
        await new Promise((r) => setTimeout(r, 20))
      }
      assert.fail('La seconde connexion ne bloque pas sur la transaction concurrente')
    }
    const suivre = (promesse) =>
      promesse.then(
        () => ({ code: null }),
        (erreur) => ({ code: erreur.code }),
      )
    const premiere = await fixture()
    await commencer(a, premiere)
    await inscrire(a, premiere)
    await a.query('reset role')
    await commencer(b, premiere)
    attente = suivre(abandonner(b, premiere))
    await constaterAttente()
    await a.query('commit')
    assert.equal((await attente).code, null)
    await b.query('commit')
    assert.equal(
      (await a.query('select count(*)::int as n from pieces where chemin=$1', [premiere.chemin]))
        .rows[0].n,
      1,
    )
    assert.equal(
      (
        await a.query('select count(*)::int as n from objets_a_supprimer where chemin=$1', [
          premiere.chemin,
        ])
      ).rows[0].n,
      0,
    )
    assert.equal(
      (
        await a.query('select count(*)::int as n from chemins_abandonnes where chemin=$1', [
          premiere.chemin,
        ])
      ).rows[0].n,
      0,
    )
    console.log('OK : inscription non commise bloque abandon ; apres commit aucune mise en file')

    const seconde = await fixture()
    await commencer(a, seconde)
    await abandonner(a, seconde)
    await a.query('reset role')
    await commencer(b, seconde)
    attente = suivre(inscrire(b, seconde))
    await constaterAttente()
    await a.query('commit')
    assert.equal((await attente).code, '23514')
    await b.query('rollback')
    assert.equal(
      (
        await a.query('select count(*)::int as n from objets_a_supprimer where chemin=$1', [
          seconde.chemin,
        ])
      ).rows[0].n,
      1,
    )
    assert.equal(
      (
        await a.query('select count(*)::int as n from chemins_abandonnes where chemin=$1', [
          seconde.chemin,
        ])
      ).rows[0].n,
      1,
    )
    await a.query('delete from objets_a_supprimer where chemin=$1', [seconde.chemin])
    await commencer(b, seconde)
    assert.equal((await suivre(inscrire(b, seconde))).code, '23514')
    await b.query('rollback')
    assert.equal(
      (await a.query('select count(*)::int as n from pieces where chemin=$1', [seconde.chemin]))
        .rows[0].n,
      0,
    )
    console.log(
      'OK : abandon non commis bloque inscription puis refuse 23514, meme apres acquittement',
    )

    async function reserverFixture() {
      const f = await fixture(false)
      await commencer(a, f, 'depot_piece')
      await a.query('select reserver_depot($1)', [f.chemin])
      await a.query('commit')
      return f
    }
    const televerser = (client, f) =>
      client.query("insert into storage.objects(bucket_id,name) values ('pieces',$1)", [f.chemin])
    async function echeanceCourte(f) {
      return (
        await a.query(
          "update reservations_depot set expire_le=clock_timestamp()+interval '1200 milliseconds' where chemin=$1 returning expire_le::text as echeance",
          [f.chemin],
        )
      ).rows[0].echeance
    }
    async function attendreEcheance(echeance) {
      const limite = Date.now() + 3000
      while (Date.now() < limite) {
        if (
          (await a.query('select clock_timestamp()>$1::timestamptz as atteinte', [echeance]))
            .rows[0].atteinte
        )
          return
        await new Promise((r) => setTimeout(r, 20))
      }
      assert.fail('Echeance de test non atteinte')
    }
    async function reprendre(client) {
      await client.query('begin; set local role serveur')
      await client.query('select reprendre_depots_inacheves()')
    }
    const compter = async (table, f) => {
      assert(
        ['pieces', 'objets_a_supprimer', 'reservations_depot', 'chemins_abandonnes'].includes(
          table,
        ),
      )
      return (await a.query(`select count(*)::int as n from ${table} where chemin=$1`, [f.chemin]))
        .rows[0].n
    }

    const deadline = await reserverFixture()
    const limiteDepot = await echeanceCourte(deadline)
    await a.query('begin')
    await a.query('select 1 from dossiers where id=$1 for update', [deadline.id])
    await commencer(b, deadline, 'depot_piece')
    attente = suivre(televerser(b, deadline))
    await constaterAttente()
    assert(
      (
        await a.query(
          'select xact_start<$1::timestamptz as avant from pg_stat_activity where pid=$2',
          [limiteDepot, pidB],
        )
      ).rows[0].avant,
      'Le depot doit commencer avant son echeance',
    )
    await attendreEcheance(limiteDepot)
    await a.query('commit')
    assert.equal((await attente).code, '42501')
    await b.query('rollback')
    console.log(
      'OK : metadata commence avant echeance, attend verrou puis refuse reservation expiree',
    )

    const expire = await reserverFixture()
    await a.query('begin')
    await a.query('select 1 from dossiers where id=$1 for update', [expire.id])
    await commencer(b, expire, 'depot_piece')
    attente = suivre(televerser(b, expire))
    await constaterAttente()
    await a.query(
      "update dossiers set cree_le=clock_timestamp()-interval '1 day',expire_le=clock_timestamp()-interval '1 second' where id=$1",
      [expire.id],
    )
    await a.query('commit')
    assert.equal((await attente).code, '42501')
    await b.query('rollback')
    console.log('OK : expiration dossier concurrente bloque puis interdit metadata Storage')

    const finalise = await reserverFixture()
    await commencer(a, finalise, 'depot_piece')
    await televerser(a, finalise)
    await a.query('commit')
    const limiteFinalisation = await echeanceCourte(finalise)
    await commencer(a, finalise)
    await inscrire(a, finalise)
    await a.query('reset role')
    await attendreEcheance(limiteFinalisation)
    await reprendre(b)
    await b.query('commit')
    assert.equal(await compter('objets_a_supprimer', finalise), 0)
    await a.query('commit')
    await reprendre(b)
    await b.query('commit')
    assert.equal(await compter('pieces', finalise), 1)
    assert.equal(await compter('reservations_depot', finalise), 0)
    assert.equal(await compter('chemins_abandonnes', finalise), 0)
    assert.equal(await compter('objets_a_supprimer', finalise), 0)
    console.log(
      'OK : reprise ignore finalisation verrouillee ; apres commit aucun nettoyage des octets',
    )

    const abandon = await reserverFixture()
    await a.query(
      "update reservations_depot set expire_le=clock_timestamp()-interval '1 second' where chemin=$1",
      [abandon.chemin],
    )
    await reprendre(a)
    await a.query('reset role')
    await commencer(b, abandon, 'depot_piece')
    attente = suivre(televerser(b, abandon))
    await constaterAttente()
    await a.query('commit')
    assert.equal((await attente).code, '42501')
    await b.query('rollback')
    assert.equal(await compter('objets_a_supprimer', abandon), 1)
    assert.equal(await compter('reservations_depot', abandon), 0)
    assert.equal(await compter('chemins_abandonnes', abandon), 1)
    await a.query('delete from objets_a_supprimer where chemin=$1', [abandon.chemin])
    await commencer(b, abandon, 'depot_piece')
    assert.equal((await suivre(televerser(b, abandon))).code, '42501')
    await b.query('rollback')
    await commencer(b, abandon, 'depot_piece')
    assert.equal((await suivre(inscrire(b, abandon))).code, '23514')
    await b.query('rollback')
    console.log(
      'OK : reprise gagnante bloque puis refuse metadata tardive, meme apres acquittement',
    )

    for (const typeExpiration of ['dossier', 'jeton']) {
      const tardive = await reserverFixture()
      await commencer(a, tardive, 'depot_piece')
      await televerser(a, tardive)
      await a.query('commit')
      const requeteExpiration =
        typeExpiration === 'dossier'
          ? "update dossiers set expire_le=clock_timestamp()+interval '1200 milliseconds' where id=$1 returning expire_le::text as echeance"
          : "update jetons_actifs set expire_le=clock_timestamp()+interval '1200 milliseconds' where dossier_id=$1 and partie='garant' returning expire_le::text as echeance"
      const echeance = (await a.query(requeteExpiration, [tardive.id])).rows[0].echeance
      await a.query('begin')
      await a.query('select 1 from dossiers where id=$1 for update', [tardive.id])
      await commencer(b, tardive, 'depot_piece')
      attente = suivre(inscrire(b, tardive))
      await constaterAttente()
      assert(
        (
          await a.query(
            'select xact_start<$1::timestamptz as avant from pg_stat_activity where pid=$2',
            [echeance, pidB],
          )
        ).rows[0].avant,
        'La finalisation doit commencer avant son echeance',
      )
      await attendreEcheance(echeance)
      await a.query('commit')
      assert.equal((await attente).code, '23514')
      await b.query('rollback')
      assert.equal(await compter('pieces', tardive), 0)
      assert.equal(await compter('reservations_depot', tardive), 1)
      console.log(
        `OK : finalisation commence avant expiration ${typeExpiration}, attend verrou puis refuse 23514`,
      )
    }
  } finally {
    // Liberer d'abord le bloqueur, puis attendre le bloque ; aucun rejet non observe.
    if (connecteA) await a.query('rollback').catch(() => {})
    await attente
    if (connecteB) await b.query('rollback').catch(() => {})
    try {
      if (connecteA) {
        await a.query('reset role')
        await a.query('delete from dossiers where id=any($1::uuid[])', [dossiers])
        for (const id of dossiers) {
          await a.query("delete from storage.objects where bucket_id='pieces' and name like $1", [
            `${id}/%`,
          ])
          await a.query('delete from objets_a_supprimer where chemin like $1', [`${id}/%`])
        }
      }
    } finally {
      await Promise.allSettled([a.end(), b.end()])
    }
  }
}
