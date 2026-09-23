import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({
  client: vi.fn(),
  rpc: vi.fn(),
  traiter: vi.fn(),
  charger: vi.fn(),
  rapprocher: vi.fn(),
  retirer: vi.fn(),
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
vi.mock('@/lib/signature/parcours', () => ({ traiterActe: h.traiter, chargerActe: h.charger }))
vi.mock('@/lib/paiement/stripe', () => ({ rapprocherSessionActe: h.rapprocher }))
import { POST as signature } from '@/app/api/signature/traitement/route'
import { POST as paiement } from '@/app/api/paiement/actes/rapprochement/route'
const requete = (secret = 'fictif') =>
  new Request('https://example.invalid', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'fictif')
  vi.stubEnv('SIGNATURE_PARCOURS_ENABLED', 'false')
  vi.stubEnv('FACTURATION_ACTES_ENABLED', 'false')
  h.client.mockResolvedValue({ rpc: h.rpc, storage: { from: () => ({ remove: h.retirer }) } })
  h.rpc.mockImplementation(async (n) => ({
    data:
      n === 'expirer_archives_signature' ? 0 : n === 'fichiers_archives_a_supprimer' ? [] : null,
    error: null,
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
test.each([signature, paiement])(
  'une route refuse avant toute lecture sans secret',
  async (route) => {
    const r = await route(requete('autre'))
    expect(r.status).toBe(401)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(h.client).not.toHaveBeenCalled()
  },
)
test('la conservation continue quand les nouveaux parcours sont fermes', async () => {
  expect(await (await signature(requete())).json()).toEqual({
    actif: false,
    traites: 0,
    effaces: 0,
    echecs: 0,
  })
  expect(h.rpc).toHaveBeenCalledWith('expirer_archives_signature')
  expect(h.traiter).not.toHaveBeenCalled()
})
test('la fermeture de facturation interdit les appels Stripe', async () => {
  expect(await (await paiement(requete())).json()).toEqual({ actif: false, traites: 0, echecs: 0 })
  expect(h.rapprocher).not.toHaveBeenCalled()
  expect(h.client).not.toHaveBeenCalled()
})
test('une erreur de conservation reste un echec sans detail prive', async () => {
  h.rpc.mockRejectedValue(new Error('DOCUMENT_PRIVE'))
  const r = await signature(requete())
  expect(r.status).toBe(503)
  expect(JSON.stringify(await r.json())).not.toContain('DOCUMENT_PRIVE')
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('DOCUMENT_PRIVE')
})
test('le rapprochement bancaire echoue si une des sessions ne se confirme pas', async () => {
  vi.stubEnv('FACTURATION_ACTES_ENABLED', 'true')
  h.rpc.mockImplementation(async (n) => ({
    data:
      n === 'reglements_actes_a_rapprocher'
        ? [{ id: '11111111-1111-4111-8111-111111111111', session_ref: 'cs_fixture' }]
        : 0,
    error: null,
  }))
  h.rapprocher.mockRejectedValue(new Error('Panne privee'))
  const r = await paiement(requete())
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ actif: true, traites: 0, echecs: 1 })
})
