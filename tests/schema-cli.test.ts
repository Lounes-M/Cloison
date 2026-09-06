import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
// @ts-expect-error Programme Node autonome execute aussi en CI.
import { verifierSchemaDistant } from '../scripts/verifier-schema-distant.mjs'
test('le transport HTTP refuse une redirection sans lui transmettre le secret', async () => {
  let cible = false
  const serveur = createServer((req, res) => {
    if (req.url === '/redir') return res.writeHead(308, { Location: '/cible' }).end()
    if (req.url === '/cible') cible = true
    if (req.url === '/html') return res.end('pas de JSON')
    if (req.url === '/erreur') return res.writeHead(503).end(JSON.stringify({ conforme: true }))
    if (req.headers.authorization !== 'Bearer fixture-secret') return res.writeHead(401).end()
    res.end(JSON.stringify({ conforme: true }))
  })
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r))
  const site = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
  try {
    for (const chemin of ['/redir', '/html', '/erreur'])
      await expect(verifierSchemaDistant(site + chemin, 'fixture-secret')).rejects.toThrow()
    expect(cible).toBe(false)
    await expect(verifierSchemaDistant(site, 'mauvais')).rejects.toThrow('Controle schema refuse')
    await expect(verifierSchemaDistant(site, '')).rejects.toThrow('Secret absent')
    await expect(verifierSchemaDistant(site, 'fixture-secret')).resolves.toBeUndefined()
  } finally {
    serveur.closeAllConnections()
    await new Promise<void>((r) => serveur.close(() => r()))
  }
})
for (const cas of ['normal', 'alerte', 'invalide', 'reseau', 'http']) {
  test(`le programme CLI rend le bon code de sortie pour ${cas} sans journal prive`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'cloison-supervision-'))
    const prive = 'secret-personnel@example.invalid'
    const r = { conforme: true }
    if (cas === 'alerte') r.conforme = false
    const valeur = cas === 'invalide' ? { ...r, email: prive } : r
    try {
      const source =
        cas === 'reseau'
          ? `globalThis.fetch=async()=>{throw new Error(${JSON.stringify(prive)})}`
          : `globalThis.fetch=async()=>new Response(${JSON.stringify(JSON.stringify(valeur))},{status:${cas === 'http' ? 503 : 200}})`
      const loader = join(dir, 'fetch.mjs')
      writeFileSync(loader, source)
      const execution = spawnSync(
        process.execPath,
        ['--import', loader, resolve('scripts/verifier-schema-distant.mjs')],
        {
          env: { ...process.env, CRON_SECRET: 'fixture-secrete' },
          encoding: 'utf8',
          timeout: 5000,
        },
      )
      expect(execution.status).toBe(cas === 'normal' ? 0 : 1)
      expect(execution.stdout + execution.stderr).not.toContain(prive)
      if (cas === 'normal') expect(execution.stdout).toContain('Schema de production conforme')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('le controle de schema reste execute apres une alerte de compteurs', () => {
  const workflow = readFileSync(resolve('.github/workflows/supervision.yml'), 'utf8')
  const etape = workflow
    .split('      - name:')
    .find((s) => s.includes('run: node scripts/verifier-schema-distant.mjs'))
  expect(etape).toContain('if: ${{ !cancelled() }}')
})
