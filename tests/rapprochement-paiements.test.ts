import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), lire: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
vi.mock('@/lib/paiement/stripe', () => ({ lireSessionPourRapprochement: h.lire }))
import { POST } from '@/app/api/paiement/rapprochement/route'
const snapshot = {
  reference_session: 'cs_fictif',
  reference_paiement: 'pi_fictif',
  le_dossier: '11111111-1111-4111-8111-111111111111',
  montant: 900,
  devise: 'eur',
  version_tarif: 'locataire-2026-09-04',
  paye: true,
}
const requete = (secret = 'fictif') =>
  new Request('https://example.invalid', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'fictif')
  vi.stubEnv('CRON_SUPABASE_SECRET', 'secondaire')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.client.mockResolvedValue({ rpc: h.rpc })
  h.lire.mockResolvedValue(snapshot)
  h.rpc.mockImplementation(async (nom: string) => ({
    data: nom === 'paiements_a_rapprocher' ? [{ reference_session: 'cs_fictif' }] : true,
    error: null,
  }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
test('la cle secondaire de maintenance ne lance aucun rapprochement', async () => {
  expect((await POST(requete('secondaire'))).status).toBe(401)
  expect(h.client).not.toHaveBeenCalled()
})
test('le snapshot fournisseur est confirme en base avant de compter un succes', async () => {
  const r = await POST(requete())
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ traites: 1, echecs: 0 })
  expect(h.rpc).toHaveBeenCalledWith('rapprocher_paiement', snapshot)
})
test.each([null, undefined, 'true', false])(
  'un acquittement %j ne compte pas un rapprochement',
  async (data) => {
    h.rpc.mockImplementation(async (nom: string) => ({
      data:
        nom === 'paiements_a_rapprocher'
          ? [{ reference_session: 'cs_fictif' }]
          : nom === 'reserver_rapprochement'
            ? true
            : data,
      error: null,
    }))
    expect((await POST(requete())).status).toBe(503)
  },
)
test('une reservation deja prise ne relit pas Stripe', async () => {
  h.rpc.mockImplementation(async (nom: string) => ({
    data: nom === 'paiements_a_rapprocher' ? [{ reference_session: 'cs_fictif' }] : false,
    error: null,
  }))
  expect((await POST(requete())).status).toBe(200)
  expect(h.lire).not.toHaveBeenCalled()
})
test('une panne fournisseur est rejouable sans verser son erreur dans les journaux', async () => {
  h.lire.mockRejectedValue(new Error('ADRESSE_PRIVEE'))
  expect((await POST(requete())).status).toBe(503)
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('ADRESSE_PRIVEE')
  expect(h.rpc).not.toHaveBeenCalledWith('rapprocher_paiement', expect.anything())
})
