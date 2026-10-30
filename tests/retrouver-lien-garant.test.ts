import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ serveur: vi.fn(), livrer: vi.fn(), debit: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.serveur }))
vi.mock('@/lib/acces/debit', () => ({ consommerDebit: h.debit }))
vi.mock('@/lib/courriels/livraison-liens', () => ({ reprendreLivraisonLiens: h.livrer }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}))

import { continuite } from '@/lib/content/continuite'
import { retrouverMonLienGarant } from '@/lib/garant/action-retrouver'

const DOSSIER = '11111111-1111-4111-8111-111111111111'
const form = (v: Record<string, string>) => {
  const f = new FormData()
  for (const [k, x] of Object.entries(v)) f.set(k, x)
  return f
}

beforeEach(() => {
  h.serveur.mockResolvedValue({ rpc: h.rpc })
  h.debit.mockResolvedValue(true)
  h.rpc.mockResolvedValue({ data: [{ dossier_id: DOSSIER }], error: null })
})
afterEach(() => vi.resetAllMocks())

const reponse = { message: continuite.garant.resultat }

test('un couple connu relance la livraison du lien du dossier', async () => {
  expect(
    await retrouverMonLienGarant(
      {},
      form({ email: ' Garant@Example.test ', reference: ' REF123 ' }),
    ),
  ).toEqual(reponse)
  expect(h.debit).toHaveBeenCalledWith(expect.anything(), 'lien_garant', '203.0.113.7')
  expect(h.debit).toHaveBeenCalledWith(expect.anything(), 'lien_garant', 'garant@example.test')
  expect(h.rpc).toHaveBeenCalledWith('retrouver_lien_garant', {
    courriel: 'garant@example.test',
    reference_dossier: 'REF123',
  })
  expect(h.livrer).toHaveBeenCalledWith(DOSSIER)
})

test('la reponse ne distingue ni un inconnu, ni un debit epuise, ni une saisie invalide', async () => {
  h.rpc.mockResolvedValue({ data: [], error: null })
  expect(
    await retrouverMonLienGarant({}, form({ email: 'x@example.test', reference: 'R' })),
  ).toEqual(reponse)
  h.debit.mockResolvedValue(false)
  expect(
    await retrouverMonLienGarant({}, form({ email: 'x@example.test', reference: 'R' })),
  ).toEqual(reponse)
  expect(
    await retrouverMonLienGarant({}, form({ email: 'pas-une-adresse', reference: 'R' })),
  ).toEqual(reponse)
  expect(h.livrer).not.toHaveBeenCalled()
})
