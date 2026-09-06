import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { lireRapportSupervision, contientAlertes } from '@/lib/exploitation/supervision.mjs'
// @ts-expect-error Programme Node autonome egalement execute par GitHub Actions.
import { executerSupervision } from '../scripts/executer-supervision.mjs'
function fixture() {
  return {
    version: 1 as const,
    alertes: {
      collaborateurs_acces_intensifs: 0,
      dossiers_acces_intensifs: 0,
      purges_en_retard: 0,
      courriels_a_reconcilier: 0,
    },
    pilote: {
      jours: 28 as const,
      dossiers_presents: 4,
      avec_agence: 2,
      garant_designe: 3,
      avec_piece_presente: 2,
      complets_ou_transmis: 1,
      marques_signes: 0,
    },
  }
}
for (const valeur of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null, undefined]) {
  test(`un compteur invalide ${String(valeur)} ne devient jamais un succes`, () => {
    const r = fixture()
    Object.assign(r.alertes, { purges_en_retard: valeur })
    expect(() => lireRapportSupervision(r)).toThrow('Rapport de supervision invalide')
  })
}
for (const nom of Object.keys(fixture().alertes)) {
  test(`une alerte ${nom} exige attention`, () => {
    const r = fixture()
    Object.assign(r.alertes, { [nom]: 1 })
    expect(contientAlertes(r)).toBe(true)
  })
}
test('le contrat refuse champs prives, sections absentes et chiffres incoherents', () => {
  const r = fixture()
  for (const invalide of [
    { ...r, email: 'prive@audit.invalid' },
    { version: 1 },
    { ...r, version: 2 },
    { ...r, pilote: { ...r.pilote, jours: 7 } },
    { ...r, pilote: { ...r.pilote, avec_piece_presente: 5 } },
    { ...r, pilote: { ...r.pilote, marques_signes: 2 } },
  ])
    expect(() => lireRapportSupervision(invalide)).toThrow()
  expect(lireRapportSupervision(r)).toEqual(r)
  expect(contientAlertes(r)).toBe(false)
})
test('le transport HTTP refuse une redirection sans lui transmettre le secret', async () => {
  let cible = false
  const serveur = createServer((req, res) => {
    if (req.url === '/redir') return res.writeHead(308, { Location: '/cible' }).end()
    if (req.url === '/cible') cible = true
    if (req.url === '/html') return res.end('pas de JSON')
    if (req.url === '/erreur') return res.writeHead(503).end(JSON.stringify(fixture()))
    if (req.headers.authorization !== 'Bearer fixture-secret') return res.writeHead(401).end()
    res.end(JSON.stringify(fixture()))
  })
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r))
  const site = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
  try {
    for (const chemin of ['/redir', '/html', '/erreur'])
      await expect(executerSupervision(site + chemin, 'fixture-secret')).rejects.toThrow()
    expect(cible).toBe(false)
    await expect(executerSupervision(site, 'mauvais')).rejects.toThrow('401')
    await expect(executerSupervision(site, '')).rejects.toThrow('CRON_SECRET absent')
    await expect(executerSupervision(site, 'fixture-secret')).resolves.toEqual(fixture())
  } finally {
    serveur.closeAllConnections()
    await new Promise<void>((r) => serveur.close(() => r()))
  }
})
for (const cas of ['normal', 'alerte', 'invalide', 'reseau', 'http']) {
  test(`le programme CLI rend le bon code de sortie pour ${cas} sans journal prive`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'cloison-supervision-'))
    const prive = 'secret-personnel@example.invalid'
    const r = fixture()
    if (cas === 'alerte') r.alertes.purges_en_retard = 1
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
        ['--import', loader, resolve('scripts/executer-supervision.mjs')],
        {
          env: { ...process.env, CRON_SECRET: 'fixture-secrete' },
          encoding: 'utf8',
          timeout: 5000,
        },
      )
      expect(execution.status).toBe(cas === 'normal' ? 0 : 1)
      expect(execution.stdout + execution.stderr).not.toContain(prive)
      if (cas === 'normal' || cas === 'alerte') expect(JSON.parse(execution.stdout)).toEqual(r)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
