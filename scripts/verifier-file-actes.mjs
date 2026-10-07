import assert from 'node:assert/strict'
import { mkdtemp, realpath, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { examinerFileActes } from '../lib/exploitation/file-actes.ts'

export async function verifierFileActes(db, connexion) {
  const avant = (
    await db.query(
      'select id,traitement_tentatives,traitement_dernier from actes_signature order by id',
    )
  ).rows
  const r = await examinerFileActes(db, 'sandbox')
  assert.equal(r.pretes, 2)
  assert.equal(r.archivages_prets, 2)
  const repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-file-actes-'))
  try {
    const destination = join(repertoire, 'rapport.json')
    const cli = spawnSync(
      process.execPath,
      [resolve('scripts/examiner-file-actes.mjs'), 'sandbox', destination],
      {
        input: JSON.stringify({ connexion }),
        encoding: 'utf8',
        timeout: 20000,
      },
    )
    assert.equal(cli.status, 0, 'Le CLI de diagnostic doit produire un rapport prive')
    assert.deepEqual(Object.keys(JSON.parse(cli.stdout)).sort(), ['sha256', 'taille'])
    assert.equal((await stat(destination)).mode & 0o777, 0o600)
    const rapport = JSON.parse(await readFile(destination, 'utf8'))
    assert.equal(rapport.pretes, 2)
    assert.equal(rapport.archivages_prets, 2)
    assert.deepEqual(
      (
        await db.query(
          'select id,traitement_tentatives,traitement_dernier from actes_signature order by id',
        )
      ).rows,
      avant,
    )
  } finally {
    await rm(repertoire, { recursive: true, force: true })
  }
}
