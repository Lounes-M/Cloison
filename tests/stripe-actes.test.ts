import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { creerSessionActe, rapprocherSessionActe } from '@/lib/paiement/stripe'
const h = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), rpc: vi.fn() }))
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: h.create, retrieve: h.retrieve } }
  },
}))
vi.mock('@/lib/env', () => ({ env: { stripeSecretKey: 'fixture' } }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({ rpc: h.rpc }) }))
const id = '11111111-1111-4111-8111-111111111111',
  facture = '22222222-2222-4222-8222-222222222222'
const r = () => ({
  id,
  facture,
  montant: 2900,
  tarif: 'acte-2026-09-04',
  session: null,
  cree_le: new Date().toISOString(),
})
const session = () => ({
  id: 'cs_fixture',
  livemode: true,
  mode: 'payment',
  currency: 'eur',
  amount_total: 2900,
  client_reference_id: facture,
  metadata: {
    produit: 'cloison_acte',
    facture_id: facture,
    tentative: id,
    tarif_version: 'acte-2026-09-04',
  },
  status: 'open',
  payment_status: 'unpaid',
  url: 'https://checkout.stripe.com/c/pay/fixture',
})
beforeEach(() => {
  vi.resetAllMocks()
  h.rpc.mockResolvedValue({ data: true, error: null })
  h.create.mockResolvedValue(session())
  h.retrieve.mockResolvedValue(session())
})
afterEach(() => vi.unstubAllGlobals())
test('une reponse perdue conserve la meme cle et les memes parametres de paiement', async () => {
  const p = r()
  h.create.mockRejectedValueOnce(new Error('Reponse perdue'))
  await expect(creerSessionActe(p, 'https://example.invalid')).rejects.toThrow()
  expect(await creerSessionActe(p, 'https://example.invalid')).toBe(session().url)
  expect(h.create.mock.calls[0]).toEqual(h.create.mock.calls[1])
  expect(h.create.mock.calls[1]?.[1]).toEqual({ idempotencyKey: `cloison-acte:${id}` })
})
test('aucune creation apres la fenetre idempotente et aucune rotation implicite', async () => {
  await expect(
    creerSessionActe(
      { ...r(), cree_le: new Date(Date.now() - 24 * 3600000).toISOString() },
      'https://example.invalid',
    ),
  ).rejects.toThrow('Reglement a rapprocher')
  expect(h.create).not.toHaveBeenCalled()
})
test.each([
  { amount_total: 1 },
  { livemode: false },
  { client_reference_id: id },
  { currency: 'usd' },
  { url: 'https://hostile.invalid' },
])('refuse une session incoherente %j', async (modif) => {
  h.create.mockResolvedValue({ ...session(), ...modif })
  await expect(creerSessionActe(r(), 'https://example.invalid')).rejects.toThrow()
})
test('une reference persistante est relue sans creation', async () => {
  expect(await creerSessionActe({ ...r(), session: 'cs_fixture' }, 'https://example.invalid')).toBe(
    session().url,
  )
  expect(h.create).not.toHaveBeenCalled()
})
test('le rapprochement exige le paiement et la charge coherents, pas le retour navigateur', async () => {
  h.retrieve.mockResolvedValue({
    ...session(),
    status: 'complete',
    payment_status: 'paid',
    payment_intent: {
      id: 'pi_fixture',
      status: 'succeeded',
      latest_charge: {
        id: 'ch_fixture',
        paid: true,
        amount: 2900,
        currency: 'eur',
        amount_refunded: 0,
        disputed: false,
      },
    },
  })
  await rapprocherSessionActe('cs_fixture', id)
  expect(h.rpc).toHaveBeenCalledWith(
    'rapprocher_reglement_acte',
    expect.objectContaining({
      le_id: id,
      la_facture: facture,
      statut: 'paye',
      le_paiement: 'pi_fixture',
    }),
  )
  h.retrieve.mockResolvedValue({
    ...session(),
    status: 'complete',
    payment_status: 'paid',
    payment_intent: null,
  })
  h.rpc.mockClear()
  await expect(rapprocherSessionActe('cs_fixture', id)).rejects.toThrow('Paiement incomplet')
  expect(h.rpc).not.toHaveBeenCalled()
})
