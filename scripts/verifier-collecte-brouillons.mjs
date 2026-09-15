import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { mkdtemp, realpath, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fixtureBrouillonsDroits } from './fixture-brouillons-droits.mjs'
import { collecterCopiePersonnelle } from '../lib/droits/brouillons.ts'
export async function verifierCollecteBrouillons(db, connexion) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  const url = new URL(connexion)
  assert(
    ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/cloison_audit_test',
  )
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  const f = await fixtureBrouillonsDroits(db, true)
  const repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-brouillons-natifs-'))
  try {
    const decision = join(repertoire, 'decision.json'),
      sortie = join(repertoire, 'source.json')
    await writeFile(decision, f.brut, { mode: 0o600 })
    const cli = spawnSync(
      process.execPath,
      [resolve('scripts/collecter-donnees-droits.mjs'), decision, sortie],
      {
        input: JSON.stringify({
          connexion,
          trousseau: {
            historique: f.trousseau.historique.toString('base64'),
            active: f.trousseau.active.toString('base64'),
            lecture: [],
          },
        }),
        encoding: 'utf8',
        timeout: 20000,
      },
    )
    assert.equal(cli.status, 0, 'La collecte CLI doit inclure le brouillon chiffre')
    assert.deepEqual(Object.keys(JSON.parse(cli.stdout)).sort(), ['sha256', 'taille'])
    assert(!cli.stdout.includes(f.saisie.revenu))
    const copie = JSON.parse(await readFile(sortie, 'utf8'))
    assert.deepEqual(copie.brouillons[0].saisie, f.saisie)
    assert.equal(copie.remiseAutorisee, false)
    assert.equal((await stat(sortie)).mode & 0o777, 0o600)
  } finally {
    await rm(repertoire, { recursive: true, force: true })
  }
  const autre = new Client({
    connectionString: connexion,
    query_timeout: 6000,
    statement_timeout: 5000,
  })
  try {
    await autre.connect()
    const copie = await collecterCopiePersonnelle(db, f.brut, f.trousseau)
    await autre.query('update brouillons_engagement set revision=$1 where dossier_id=$2', [
      randomUUID(),
      f.dossier,
    ])
    await assert.rejects(copie.verifier, /Collecte des brouillons refusee/)
  } finally {
    await autre.end()
  }
  console.log(
    'OK : collecte CLI des brouillons, rotation, fichier prive et modification depuis une seconde connexion',
  )
}
