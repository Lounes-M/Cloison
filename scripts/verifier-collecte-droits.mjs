import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { mkdtemp, realpath, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fixtureCollecteDroits } from './fixture-collecte-droits.mjs'
import { collecterDonneesDroits } from '../lib/droits/collecte.ts'
import { verifierPiecesDroits } from './verifier-pieces-droits.mjs'

export async function verifierCollecteDroits(db, connexion) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  const url = new URL(connexion)
  assert(
    ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/cloison_audit_test',
  )
  const f = await fixtureCollecteDroits(db)
  const r = await collecterDonneesDroits(db, f.brut)
  assert.equal(r.dossiers.length, 2)
  assert.equal(r.dossiers[0].engagement.revenu_net_mensuel_cents, '9007199254740993')
  assert.equal(r.dossiers[1].engagement, null)
  assert.equal(r.dossiers[1].pieces.length, 0)
  for (const interdit of [
    'Identite tierce interdite',
    'Garant tiers interdit',
    'chemin-prive-interdit',
    f.etranger,
  ])
    assert(!JSON.stringify(r).includes(interdit))
  if (['linux', 'darwin'].includes(process.platform)) {
    const repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-collecte-native-'))
    try {
      const decision = join(repertoire, 'decision.json')
      const sortie = join(repertoire, 'source.json')
      await writeFile(decision, f.brut, { mode: 0o600 })
      const cli = spawnSync(
        process.execPath,
        [resolve('scripts/collecter-donnees-droits.mjs'), decision, sortie],
        {
          input: JSON.stringify({ connexion }),
          encoding: 'utf8',
          timeout: 20000,
        },
      )
      assert.equal(cli.status, 0, 'Le CLI de collecte privee doit terminer')
      const bilan = JSON.parse(cli.stdout)
      assert.deepEqual(Object.keys(bilan).sort(), ['sha256', 'taille'])
      assert(!cli.stdout.includes(f.decision.destinataire.email))
      const copie = JSON.parse(await readFile(sortie, 'utf8'))
      assert.deepEqual(copie.dossiers, r.dossiers)
      assert.equal((await stat(sortie)).mode & 0o777, 0o600)
    } finally {
      await rm(repertoire, { recursive: true, force: true })
    }
  }
  for (const role of [
    'anon',
    'authenticated',
    'porteur_lien',
    'serveur',
    'depot_piece',
    'service_role',
  ]) {
    await db.query(`set role ${role}`)
    try {
      await assert.rejects(collecterDonneesDroits(db, f.brut), /Collecte individuelle refusee/)
    } finally {
      await db.query('reset role')
    }
  }
  const autre = new Client({
    connectionString: connexion,
    query_timeout: 6000,
    statement_timeout: 5000,
  })
  try {
    await autre.connect()
    let remplacee = false
    await assert.rejects(
      collecterDonneesDroits(
        {
          query: async (sql, params) => {
            const resultat = await db.query(sql, params)
            if (sql.includes('with selection')) {
              await autre.query(
                `insert into public.suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
          select $1,demande,operation,operateur,nature,'identite_a_verifier',recu_le,repondre_avant,effacer_le,preuve_sha256
          from public.suivi_demandes_droits where operation=$2`,
                [randomUUID(), f.decision.revision],
              )
              remplacee = true
            }
            return resultat
          },
        },
        f.brut,
      ),
      /Collecte individuelle refusee/,
    )
    assert.equal(remplacee, true)
  } finally {
    await autre.end()
  }
  console.log(
    'OK : collecte personnelle SQL, tiers exclus, montants exacts, six roles refuses et revision concurrente detectee',
  )
  await verifierPiecesDroits(db, connexion)
}
