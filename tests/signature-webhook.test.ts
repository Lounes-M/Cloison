import { createHmac } from 'node:crypto'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
import { POST } from '@/app/api/signature/webhook/route'
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const abonnement = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const secret = 'secret-test-youtrust-fictif-32-caracteres'
const objet = () => ({
  event_id: id,
  event_name: 'signature_request.done',
  event_time: String(Math.floor(Date.now() / 1000)),
  subscription_id: abonnement,
  sandbox: true,
  data: { signature_request: { id, status: 'done', signers: [{ email: 'PRIVE@example.test' }] } },
})
function requete(o: unknown = objet(), valide = true) {
  const body = JSON.stringify(o, null, 2)
  const signature = createHmac('sha256', valide ? secret : 'autre')
    .update(body)
    .digest('hex')
  return new Request('https://example.test/api/signature/webhook', {
    method: 'POST',
    body,
    headers: { 'x-yousign-signature-256': `sha256=${signature}` },
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('YOUTRUST_REGISTRY_ENABLED', 'true')
  vi.stubEnv('YOUTRUST_ENVIRONMENT', 'sandbox')
  vi.stubEnv('YOUTRUST_WEBHOOK_SECRET', secret)
  vi.stubEnv('YOUTRUST_WEBHOOK_SUBSCRIPTION_ID', abonnement)
  h.client.mockResolvedValue({ rpc: h.rpc })
  h.rpc.mockResolvedValue({ data: { enregistre: true, anomalie: false }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
test('ne confirme que la persistance et ne transmet aucune identite', async () => {
  const r = await POST(requete())
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ recu: true })
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith('enregistrer_evenement_signature', {
    le_mode: 'sandbox',
    evenement: id,
    la_reference: id,
    le_statut: 'done',
    survenu: expect.any(String),
  })
  expect(JSON.stringify(h.rpc.mock.calls)).not.toContain('PRIVE')
})
test.each([
  null,
  true,
  {},
  { enregistre: false, anomalie: false },
  { enregistre: true, anomalie: false, extra: 1 },
])('rejoue un acquittement invalide %#', async (data) => {
  h.rpc.mockResolvedValue({ data, error: null })
  expect((await POST(requete())).status).toBe(503)
})
test('une panne SQL ne perd pas la notification', async () => {
  h.rpc.mockResolvedValue({ data: null, error: { message: 'PRIVE' } })
  expect((await POST(requete())).status).toBe(503)
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('PRIVE')
})
test('un conflit conserve en base est acquitte sans etre expose', async () => {
  h.rpc.mockResolvedValue({ data: { enregistre: true, anomalie: true }, error: null })
  expect((await POST(requete())).status).toBe(200)
})
test('refuse la signature avant tout appel SQL', async () => {
  expect((await POST(requete(objet(), false))).status).toBe(400)
  expect(h.client).not.toHaveBeenCalled()
})
test('refuse le mauvais environnement ou abonnement', async () => {
  expect((await POST(requete({ ...objet(), sandbox: false }))).status).toBe(400)
  expect((await POST(requete({ ...objet(), subscription_id: id }))).status).toBe(400)
  expect(h.client).not.toHaveBeenCalled()
})
test('refuse les corps trop grands sans atteindre la base', async () => {
  expect((await POST(requete({ ...objet(), bruit: 'a'.repeat(65536) }))).status).toBe(413)
  expect(h.client).not.toHaveBeenCalled()
})
test('reste ferme tant que le registre est desactive', async () => {
  vi.stubEnv('YOUTRUST_REGISTRY_ENABLED', 'false')
  expect((await POST(requete())).status).toBe(503)
  expect(h.client).not.toHaveBeenCalled()
})
