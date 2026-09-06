import { format } from 'node:util'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const { rpc, client } = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: client }))
import { GET } from '@/app/api/supervision/route'
const rapport = {
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
}
function requete(secret = 'fixture-secret') {
  return new Request('https://example.invalid/api/supervision', {
    headers: { Authorization: `Bearer ${secret}` },
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'fixture-secret')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  client.mockResolvedValue({ rpc })
  rpc.mockResolvedValue({ data: rapport, error: null })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
for (const secret of ['', 'mauvais-secret', 'fixture-secrex'])
  test(`la supervision refuse ${secret || 'secret absent'} avant la base`, async () => {
    const r = await GET(requete(secret))
    expect(r.status).toBe(401)
    expect(client).not.toHaveBeenCalled()
  })
test('une configuration sans secret est fermee', async () => {
  vi.stubEnv('CRON_SECRET', '')
  expect((await GET(requete())).status).toBe(401)
  expect(client).not.toHaveBeenCalled()
})
test('la lecture autorisee expose seulement le rapport et interdit le cache', async () => {
  const r = await GET(requete())
  expect(r.status).toBe(200)
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(await r.json()).toEqual(rapport)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('rapport_exploitation')
})
for (const panne of ['sql', 'client', 'rpc', 'format'])
  test(`une panne ${panne} ne divulgue aucune erreur privee`, async () => {
    const prive = 'prive@example.invalid'
    const erreur = new Error(prive)
    if (panne === 'sql') rpc.mockResolvedValue({ data: null, error: { message: prive } })
    if (panne === 'client') client.mockRejectedValue(erreur)
    if (panne === 'rpc') rpc.mockRejectedValue(erreur)
    if (panne === 'format')
      rpc.mockResolvedValue({ data: { ...rapport, email: prive }, error: null })
    const r = await GET(requete())
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ disponible: false })
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(
      vi
        .mocked(console.error)
        .mock.calls.map((a) => format(...a))
        .join('\n'),
    ).not.toContain(prive)
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[supervision] rapport indisponible')
  })
