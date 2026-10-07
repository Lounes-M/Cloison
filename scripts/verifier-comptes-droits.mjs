import assert from 'node:assert/strict'
import { Client } from 'pg'
import { mkdtemp, realpath, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fixtureComptesDroits } from './fixture-comptes-droits.mjs'
import { collecterCopiePersonnelle } from '../lib/droits/brouillons.ts'

export async function verifierComptesDroits(db, connexion) {
  const f = await fixtureComptesDroits(db)
  const resultat = await collecterCopiePersonnelle(db, f.brut)
  assert.equal(resultat.donnees.comptes.length, 1)
  assert.equal(resultat.donnees.comptes[0].id, f.compte)
  assert(!JSON.stringify(resultat.donnees).includes(f.tiers))
  const repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-comptes-'))
  try {
    const decision = join(repertoire, 'decision.json'),
      sortie = join(repertoire, 'source.json')
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
    assert.equal(cli.status, 0, 'Le CLI doit collecter le compte approuve')
    assert.deepEqual(Object.keys(JSON.parse(cli.stdout)).sort(), ['sha256', 'taille'])
    assert(!cli.stdout.includes(f.decision.destinataire.email))
    const copie = JSON.parse(await readFile(sortie, 'utf8'))
    assert.deepEqual(copie.comptes, resultat.donnees.comptes)
    assert.equal((await stat(sortie)).mode & 0o777, 0o600)
  } finally {
    await rm(repertoire, { recursive: true, force: true })
  }
  const autre = new Client({ connectionString: connexion, query_timeout: 6000 })
  try {
    await autre.connect()
    await autre.query(
      "update auth.users set email='modifie-' || id || '@example.invalid' where id=$1",
      [f.compte],
    )
    await assert.rejects(resultat.verifier())
    await assert.rejects(collecterCopiePersonnelle(db, f.brut))
  } finally {
    await autre.end()
  }
}
