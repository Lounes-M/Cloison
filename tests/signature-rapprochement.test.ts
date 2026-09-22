import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), distant: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
vi.mock('@/lib/signature/configuration-youtrust', () => ({
  clientYoutrustConfigure: () => ({ lirePourRapprochement: h.distant }),
}))
import { POST } from '@/app/api/signature/rapprochement/route'
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const reference = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const bail = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ligne = { id, reference_fournisseur: reference, bail, revision: 1 }
const requete = (secret = 'fictif') =>
  new Request('https://example.test', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'fictif')
  vi.stubEnv('YOUTRUST_REGISTRY_ENABLED', 'true')
  vi.stubEnv('YOUTRUST_ENVIRONMENT', 'sandbox')
  h.client.mockResolvedValue({ rpc: h.rpc })
  h.distant.mockResolvedValue({ id: reference, external_id: id, status: 'done' })
  h.rpc.mockImplementation(async (nom: string) => ({
    data:
      nom === 'reserver_signatures_a_rapprocher'
        ? [ligne]
        : nom === 'signatures_a_examiner'
          ? 0
          : true,
    error: null,
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
test('exige le secret cron avant toute configuration', async () => {
  expect((await POST(requete('autre'))).status).toBe(401)
  expect(h.client).not.toHaveBeenCalled()
})
test('un registre desactive ne touche ni SQL ni fournisseur', async () => {
  vi.stubEnv('YOUTRUST_REGISTRY_ENABLED', 'false')
  expect(await (await POST(requete())).json()).toEqual({ actif: false, traites: 0, echecs: 0 })
  expect(h.client).not.toHaveBeenCalled()
})
test('le bail et la reference externe sont confirmes avant le succes', async () => {
  expect(await (await POST(requete())).json()).toEqual({ actif: true, traites: 1, echecs: 0 })
  expect(h.rpc).toHaveBeenCalledWith('confirmer_rapprochement_signature', {
    la_demande: id,
    le_mode: 'sandbox',
    le_bail: bail,
    la_revision: 1,
    la_reference: reference,
    reference_externe: id,
    le_statut: 'done',
  })
})
test('une panne distante libere le bail et reste rejouable', async () => {
  h.distant.mockRejectedValue(new Error('PRIVE'))
  expect((await POST(requete())).status).toBe(503)
  expect(h.rpc).toHaveBeenCalledWith('echec_rapprochement_signature', {
    la_demande: id,
    le_mode: 'sandbox',
    le_bail: bail,
  })
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('PRIVE')
})
test.each([
  null,
  [],
  [ligne, ligne],
  [{ ...ligne, revision: '1' }],
  [{ ...ligne, bail: 'invalide' }],
])('refuse une file incoherente ou traite une file vide %#', async (file) => {
  h.rpc.mockImplementation(async (nom: string) => ({
    data: nom === 'reserver_signatures_a_rapprocher' ? file : 0,
    error: null,
  }))
  expect((await POST(requete())).status).toBe(Array.isArray(file) && file.length === 0 ? 200 : 503)
  expect(h.distant).not.toHaveBeenCalled()
})
test('une anomalie bloquee ne disparait pas du suivi', async () => {
  h.rpc.mockImplementation(async (nom: string) => ({
    data: nom === 'reserver_signatures_a_rapprocher' ? [] : 1,
    error: null,
  }))
  expect((await POST(requete())).status).toBe(503)
})
test('un snapshot devenu obsolete ne compte pas comme traite', async () => {
  h.rpc.mockImplementation(async (nom: string) => ({
    data:
      nom === 'reserver_signatures_a_rapprocher'
        ? [ligne]
        : nom === 'signatures_a_examiner'
          ? 0
          : false,
    error: null,
  }))
  expect(await (await POST(requete())).json()).toEqual({ actif: true, traites: 0, echecs: 1 })
})
