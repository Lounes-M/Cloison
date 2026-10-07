import assert from 'node:assert/strict'
import { Client } from 'pg'
import { mkdtemp, realpath, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fixtureEffacementPieces } from './fixture-effacement-pieces.mjs'
import { effacerPiecesIndividuelles } from '../lib/droits/effacement-pieces.ts'

export async function verifierEffacementPieces(db, connexion) {
  const f = await fixtureEffacementPieces(db)
  const autre = new Client({ connectionString: connexion, query_timeout: 6000 })
  try {
    await autre.connect()
    await autre.query('begin')
    await autre.query('select id from dossiers where id=$1 for update', [f.garant])
    await assert.rejects(effacerPiecesIndividuelles(db, f.brut))
    await autre.query('rollback')
    assert.equal((await db.query('select id from pieces where id=$1', [f.piece.id])).rows.length, 1)
    const executions = await Promise.all([
      effacerPiecesIndividuelles(db, f.brut),
      effacerPiecesIndividuelles(autre, f.brut),
    ])
    assert.deepEqual(executions.map((r) => r.reprise).sort(), [false, true])
    assert.equal(
      (
        await db.query('select operation from suivi_demandes_droits where operation=$1', [
          f.decision.operation,
        ])
      ).rows.length,
      1,
    )
  } finally {
    await autre.end()
  }
  const cible = await fixtureEffacementPieces(db)
  const repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-effacement-'))
  try {
    const projet = join(repertoire, 'projet.json'),
      decision = join(repertoire, 'decision.json')
    await writeFile(projet, JSON.stringify(cible.projet), { mode: 0o600 })
    const cli = (...args) =>
      spawnSync(process.execPath, [resolve('scripts/effacer-pieces-droits.mjs'), ...args], {
        input: JSON.stringify({ connexion }),
        encoding: 'utf8',
        timeout: 20000,
      })
    const preparation = cli('preparer', projet, decision)
    assert.equal(preparation.status, 0, 'La photographie privee doit etre preparee')
    assert.equal((await stat(decision)).mode & 0o777, 0o600)
    assert.equal(await readFile(decision, 'utf8'), cible.brut)
    for (const reprise of [false, true]) {
      const execution = cli('executer', decision)
      assert.equal(execution.status, 0, 'Le retrait approuve doit etre rejouable')
      const bilan = JSON.parse(execution.stdout)
      assert.equal(bilan.reprise, reprise)
      assert.equal(bilan.effacementComplet, false)
      assert.equal(bilan.suppressionsEnFile, 1)
      for (const prive of [
        cible.piece.id,
        cible.piece.chemin,
        cible.decision.demandeur.email,
        cible.decision.operation,
      ])
        assert(!execution.stdout.includes(prive))
    }
  } finally {
    await rm(repertoire, { recursive: true, force: true })
  }
}
