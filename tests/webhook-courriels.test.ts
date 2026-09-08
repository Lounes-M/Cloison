import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
vi.mock('@/lib/env', () => ({ env: { resendApiKey: 'fixture-locale' } }))
import { POST } from '@/app/api/courriels/webhook/route'
const cle = Buffer.alloc(32, 7),
  secret = `whsec_${cle.toString('base64')}`
const id = 'msg_fixture',
  message = '00000000-0000-4000-8000-000000000081'
beforeEach(() => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', secret)
  h.client.mockResolvedValue({ rpc: h.rpc })
  h.rpc.mockResolvedValue({ data: true, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
function requete({
  signature = true,
  retard = 0,
  type = 'email.delivered',
  extra = '',
  modifier = false,
} = {}) {
  const corps = JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: 'resend_fictif',
      tags: { cloison_id: message },
      to: ['prive@example.invalid'],
      subject: extra || 'PRIVE',
      text: 'LIEN_PRIVE',
    },
  })
  const horloge = String(Math.floor(Date.now() / 1000) - retard)
  const signe = `v1,${createHmac('sha256', cle).update(`${id}.${horloge}.${corps}`).digest('base64')}`
  return new Request('https://example.test/api/courriels/webhook', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': horloge,
      'svix-signature': signature ? signe : 'v1,invalide',
    },
    body: modifier ? corps + ' ' : corps,
  })
}
test.each([{ signature: false }, { retard: 600 }, { modifier: true }])(
  'une signature invalide, perimee ou un corps modifie ne touche pas SQL %j',
  async (options) => {
    expect((await POST(requete(options))).status).toBe(400)
    expect(h.client).not.toHaveBeenCalled()
  },
)
test('un evenement signe ne transmet que les identifiants et son statut', async () => {
  const r = await POST(requete())
  expect(r.status).toBe(200)
  expect(h.rpc).toHaveBeenCalledWith('enregistrer_evenement_courriel', {
    evenement: id,
    reference_fournisseur: 'resend_fictif',
    identifiant: message,
    nature: 'email.delivered',
    survenu: expect.any(String),
  })
  expect(JSON.stringify(h.rpc.mock.calls)).not.toMatch(/PRIVE|prive@|LIEN/)
})
test.each([null, undefined, 'true'])(
  'un acquittement SQL ambigu %j demande un rejeu',
  async (data) => {
    h.rpc.mockResolvedValue({ data, error: null })
    expect((await POST(requete())).status).toBe(503)
  },
)
test('une panne SQL ne divulgue aucune erreur fournisseur', async () => {
  h.rpc.mockResolvedValue({ data: null, error: { message: 'ADRESSE_PRIVEE' } })
  const r = await POST(requete())
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ recu: false })
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('ADRESSE_PRIVEE')
})
test('un evenement inconnu valide et un message ancien inconnu sont acquittes sans faux suivi', async () => {
  expect((await POST(requete({ type: 'email.opened' }))).status).toBe(200)
  expect(h.client).not.toHaveBeenCalled()
  h.rpc.mockResolvedValue({ data: false, error: null })
  expect((await POST(requete())).status).toBe(200)
})
test('un corps reel trop grand est refuse meme sans Content-Length', async () => {
  expect((await POST(requete({ extra: 'x'.repeat(65536) }))).status).toBe(413)
  expect(h.client).not.toHaveBeenCalled()
})
test('sans configuration de signature aucun message n est accepte', async () => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
  expect((await POST(requete())).status).toBe(503)
  expect(h.client).not.toHaveBeenCalled()
})
