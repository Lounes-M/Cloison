import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from 'vitest'
// @ts-expect-error Script Node autonome, execute aussi par GitHub Actions.
import { executerMaintenance } from '../scripts/executer-maintenance.mjs'

test('la maintenance refuse redirections, faux succes et erreurs metier', async () => {
  let cibleAppelee = false
  const resultat = {
    notifications: { echecs: 0 },
    courriels: { traites: 0, echecs: 0 },
    purge: { traites: 0, echecs: 0 },
  }
  const serveur = createServer((req, res) => {
    if (req.url === '/redirection') {
      res.writeHead(308, { Location: '/cible' }).end()
    } else if (req.url === '/cible') {
      cibleAppelee = true
      res.end(JSON.stringify(resultat))
    } else if (req.url === '/html') {
      res.end('Redirecting...')
    } else if (req.url === '/echec') {
      res.end(JSON.stringify({ ...resultat, purge: { traites: 0, echecs: 1 } }))
    } else if (req.url === '/vide') {
      res.end('{}')
    } else if (req.headers.authorization !== 'Bearer secret-de-test') {
      res.writeHead(401).end()
    } else {
      res.end(JSON.stringify(resultat))
    }
  })
  await new Promise<void>((resolve) => serveur.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
  try {
    for (const chemin of ['/redirection', '/html', '/echec', '/vide']) {
      await expect(executerMaintenance(base + chemin, 'secret-de-test')).rejects.toThrow()
    }
    expect(cibleAppelee).toBe(false)
    await expect(executerMaintenance(base + '/ok', 'mauvais')).rejects.toThrow('401')
    await expect(executerMaintenance(base + '/ok', 'secret-de-test')).resolves.toEqual(resultat)
  } finally {
    serveur.closeAllConnections()
    await new Promise<void>((resolve, reject) => serveur.close((e) => (e ? reject(e) : resolve())))
  }
})
