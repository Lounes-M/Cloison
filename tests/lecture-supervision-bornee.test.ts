import { afterEach, expect, test, vi } from 'vitest'
// @ts-expect-error Programme Node autonome.
import { verifierSchemaDistant } from '../scripts/verifier-schema-distant.mjs'
// @ts-expect-error Programme Node autonome.
import { executerMaintenance } from '../scripts/executer-maintenance.mjs'
// @ts-expect-error Programme Node autonome.
import { rapprocherPaiements } from '../scripts/rapprocher-paiements.mjs'
// @ts-expect-error Programme Node autonome.
import { verifierPaiements } from '../scripts/verifier-paiements.mjs'
// @ts-expect-error Programme Node autonome.
import { verifierCadence } from '../scripts/verifier-cadence.mjs'
// @ts-expect-error Programme Node autonome.
import { executerSupervision } from '../scripts/executer-supervision.mjs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('le diagnostic refuse un JSON valide qui depasse 64 Kio', async () => {
  const appel = vi.fn(async () => new Response(' '.repeat(65536) + '{"conforme":true}'))
  vi.stubGlobal('fetch', appel)
  await expect(verifierSchemaDistant('https://fixture.invalid', 'fictif')).rejects.toThrow()
  expect(appel).toHaveBeenCalledTimes(1)
})

test.each([
  [
    'maintenance',
    executerMaintenance,
    {
      notifications: { echecs: 0 },
      courriels: { traites: 0, echecs: 0 },
      purge: { traites: 0, echecs: 0 },
    },
  ],
  ['rapprochement', rapprocherPaiements, { traites: 0, echecs: 0 }],
  [
    'paiements',
    verifierPaiements,
    {
      version: 1,
      paiements: 0,
      a_reconcilier: 0,
      remboursements: 0,
      rembourse_cents: 0,
      litiges_ouverts: 0,
      litiges_perdus: 0,
    },
  ],
  ['cadence', verifierCadence, { derniere_reussite: new Date().toISOString() }],
  [
    'supervision',
    executerSupervision,
    {
      version: 1,
      alertes: {
        collaborateurs_acces_intensifs: 0,
        dossiers_acces_intensifs: 0,
        purges_en_retard: 0,
        courriels_a_reconcilier: 0,
      },
      pilote: {
        jours: 28,
        dossiers_presents: 0,
        avec_agence: 0,
        garant_designe: 0,
        avec_piece_presente: 0,
        complets_ou_transmis: 0,
        marques_signes: 0,
      },
    },
  ],
] as const)(
  '%s refuse aussi un rapport surdimensionne sans le rejouer',
  async (_nom, executer, rapport) => {
    const appel = vi.fn(async () => new Response(' '.repeat(65536) + JSON.stringify(rapport)))
    vi.stubGlobal('fetch', appel)
    await expect(
      executer('https://www.cloison.immo/api/maintenance/etat', 'fictif'),
    ).rejects.toThrow()
    expect(appel).toHaveBeenCalledTimes(1)
  },
)

test('le delai couvre le corps du vrai transport HTTP apres les entetes', async () => {
  let appels = 0
  const serveur = createServer((_req, res) => {
    appels++
    res.writeHead(200)
    res.write('{"conforme":')
  })
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r))
  const natif = AbortSignal.timeout.bind(AbortSignal)
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((delai) => {
    expect(delai).toBe(30000)
    return natif(500)
  })
  try {
    await expect(
      verifierSchemaDistant(
        `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`,
        'fictif',
      ),
    ).rejects.toThrow()
    expect(appels).toBe(1)
  } finally {
    serveur.closeAllConnections()
    await new Promise<void>((r) => serveur.close(() => r()))
  }
})

test('le diagnostic refuse une longueur annoncee excessive meme avec un petit corps', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response('{"conforme":true}', {
        headers: { 'content-length': '65537' },
      }),
  )
  await expect(verifierSchemaDistant('https://fixture.invalid', 'fictif')).rejects.toThrow()
})
