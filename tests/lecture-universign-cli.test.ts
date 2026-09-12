import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, expect, it } from 'vitest'

let repertoire: string
const cle = 'apikey_fictive_sans_acces'
beforeEach(async () => {
  repertoire = await mkdtemp(join(tmpdir(), 'cloison-universign-'))
  await writeFile(join(repertoire, 'cle'), cle, { mode: 0o600 })
  // Aucun appel fournisseur : le vrai CLI recoit un transport local impose au demarrage.
  await writeFile(
    join(repertoire, 'transport.mjs'),
    `
    globalThis.fetch = async (url, options) => {
      if (url !== 'https://api.alpha.universign.com/v1/transactions/tx_Fictive_123'
          || options.method !== 'GET' || options.redirect !== 'error'
          || options.headers.Authorization !== 'Bearer ${cle}') throw new Error('Transport refuse');
      return new Response(JSON.stringify({object:'transaction', id:'tx_Fictive_123', state:'draft',
        participants:[{email:'prive@example.test'}], secret:'${cle}'}),
        {headers:{'content-type':'application/json'}});
    }
  `,
  )
})
afterEach(async () => {
  await rm(repertoire, { recursive: true, force: true })
})
function executer(input: string, supplement: string[] = []) {
  const fd = openSync(join(repertoire, 'cle'), 'r')
  try {
    return spawnSync(
      process.execPath,
      [
        '--import',
        join(repertoire, 'transport.mjs'),
        resolve('scripts/lire-universign.mjs'),
        ...supplement,
      ],
      {
        input,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe', fd],
        timeout: 10000,
      },
    )
  } finally {
    closeSync(fd)
  }
}
const configuration = JSON.stringify({ environnement: 'alpha', transaction: 'tx_Fictive_123' })
it('lit la cle sur fd 3 et ne produit que l etat', () => {
  const resultat = executer(configuration)
  expect(resultat.status, resultat.stderr).toBe(0)
  expect(resultat.stdout).toBe('{"etat":"draft"}\n')
  expect(resultat.stderr).toBe('')
})
it.each(['cle publique', 'cle trop longue', 'cle avec saut de ligne'])(
  'refuse une %s',
  async (cas) => {
    if (cas === 'cle publique') await chmod(join(repertoire, 'cle'), 0o644)
    else
      await writeFile(
        join(repertoire, 'cle'),
        cas === 'cle trop longue' ? 'a'.repeat(1025) : cle + '\n',
      )
    const resultat = executer(configuration)
    expect(resultat.status).toBe(1)
    expect(resultat.stdout).toBe('')
    expect(resultat.stderr).not.toContain(cle)
    expect(resultat.stderr).not.toContain(repertoire)
  },
)
it.each([
  '{',
  ' '.repeat(1025),
  JSON.stringify({ environnement: 'alpha', transaction: 'tx_secret/invalide' }),
])('refuse une entree incorrecte sans details prives %#', (input) => {
  const resultat = executer(input)
  expect(resultat.status).toBe(1)
  expect(resultat.stdout).toBe('')
  expect(resultat.stderr).toBe(
    'Lecture Universign indisponible. Verifier acces API, environnement et transaction.\n',
  )
})
it('refuse un argument supplementaire sans le journaliser', () => {
  const resultat = executer(configuration, ['secret-inutile'])
  expect(resultat.status).toBe(1)
  expect(resultat.stderr).not.toContain('secret-inutile')
})
