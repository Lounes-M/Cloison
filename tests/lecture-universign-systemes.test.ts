import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test.skipIf(process.platform !== 'win32')(
  'le CLI refuse Windows avant de lire la cle ou de contacter le fournisseur',
  () => {
    const resultat = spawnSync(process.execPath, [resolve('scripts/lire-universign.mjs')], {
      encoding: 'utf8',
      input: '',
      timeout: 5000,
    })
    expect(resultat.status).toBe(1)
    expect(resultat.stdout).toBe('')
    expect(resultat.stderr).toBe('Lecture Universign indisponible sur ce systeme.\n')
  },
)
