import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
import { POST } from '@/app/api/signature/docage/route'
import { masquerJetonDocage } from '@/lib/signature/configuration-docage'
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const jeton = 'jeton-docage-fictif-de-trente-deux-caracteres'
const requete = (o: unknown = { Id: id, GlobalStatus: 5 }, j: string | null = jeton) =>
  new Request(`https://example.test/api/signature/docage${j === null ? '' : `?jeton=${j}`}`, {
    method: 'POST',
    body: JSON.stringify(o),
  })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SIGNATURE_REGISTRE_ENABLED', 'true')
  vi.stubEnv('SIGNATURE_ENVIRONMENT', 'sandbox')
  vi.stubEnv('SIGNATURE_PRESTATAIRE', '')
  vi.stubEnv('DOCAGE_WEBHOOK_TOKEN', jeton)
  h.client.mockResolvedValue({ rpc: h.rpc })
  h.rpc.mockResolvedValue({ data: { enregistre: true, anomalie: false }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
test('un appel au bon jeton reveille la lecture, sans donnee personnelle', async () => {
  const r = await POST(requete({ Id: id, GlobalStatus: 5, Email: 'PRIVE@example.test' }))
  expect(r.status).toBe(200)
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith('enregistrer_reveil_docage', {
    le_mode: 'sandbox',
    la_reference: id,
    le_statut: 'done',
  })
  expect(JSON.stringify(h.rpc.mock.calls)).not.toContain('PRIVE')
})
test.each([null, 'autre', `${jeton}x`])('refuse le jeton %j sans toucher la base', async (j) => {
  expect((await POST(requete(undefined, j))).status).toBe(401)
  expect(h.client).not.toHaveBeenCalled()
})
test.each([{}, { Id: 'pas-un-uuid', GlobalStatus: 5 }, { Id: id, GlobalStatus: 42 }])(
  'refuse une notification illisible %#',
  async (o) => {
    expect((await POST(requete(o))).status).toBe(400)
    expect(h.client).not.toHaveBeenCalled()
  },
)
test('reste ferme si Youtrust est le prestataire choisi', async () => {
  vi.stubEnv('SIGNATURE_PRESTATAIRE', 'youtrust')
  expect((await POST(requete())).status).toBe(503)
  expect(h.client).not.toHaveBeenCalled()
})
test('ne confirme pas une notification non persistee', async () => {
  h.rpc.mockResolvedValue({ data: null, error: { message: 'panne' } })
  expect((await POST(requete())).status).toBe(503)
})
test('un Bearer suffit, le jeton en query reste accepte, et aucun journal ne le montre', async () => {
  const parEntete = new Request('https://example.test/api/signature/docage', {
    method: 'POST',
    headers: { authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ Id: id, GlobalStatus: 5 }),
  })
  expect((await POST(parEntete)).status).toBe(200)

  const mauvaisEntete = new Request(`https://example.test/api/signature/docage?jeton=${jeton}`, {
    method: 'POST',
    headers: { authorization: 'Bearer autre-valeur-qui-ne-doit-pas-compter' },
    body: JSON.stringify({ Id: id, GlobalStatus: 5 }),
  })
  expect((await POST(mauvaisEntete)).status).toBe(200)

  const sansRien = new Request('https://example.test/api/signature/docage', {
    method: 'POST',
    headers: { authorization: 'Bearer autre' },
    body: JSON.stringify({ Id: id, GlobalStatus: 5 }),
  })
  expect((await POST(sansRien)).status).toBe(401)

  h.rpc.mockRejectedValue(new Error(`panne ${jeton}`))
  const journal = vi.mocked(console.error)
  journal.mockClear()
  const rejeu = new Request('https://example.test/api/signature/docage?jeton=' + jeton, {
    method: 'POST',
    body: JSON.stringify({ Id: id, GlobalStatus: 5 }),
  })
  expect((await POST(rejeu)).status).toBe(503)
  expect(JSON.stringify(journal.mock.calls)).not.toContain(jeton)
  expect(masquerJetonDocage(`https://example.test/api/signature/docage?jeton=${jeton}`)).toBe(
    'https://example.test/api/signature/docage?jeton=***',
  )
})
