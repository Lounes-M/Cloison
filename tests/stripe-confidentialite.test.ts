import { afterEach, expect, test, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    stripeSecretKey: 'sk_test_fixture_non_secret',
    stripeWebhookSecret: 'whsec_fixture_non_secret',
  },
}))
import { lireEvenement } from '@/lib/paiement/stripe'

afterEach(() => vi.restoreAllMocks())

test('le vrai SDK Stripe ne verse pas le webhook refuse dans les journaux', () => {
  const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
  const adresse = 'temoin-confidentiel@example.invalid'
  const corps = JSON.stringify({
    id: 'evt_fixture',
    data: { object: { customer_email: adresse, description: 'DOCUMENT_FICTIF_PRIVE' } },
  })
  const signature = 't=1,v1=signature_fictive_invalide'

  // SDK reel, verification purement locale : aucun endpoint Stripe contacte.
  expect(lireEvenement(corps, signature)).toBeNull()
  expect(journal).toHaveBeenCalledOnce()
  const traces = JSON.stringify(journal.mock.calls)
  for (const sensible of [
    corps,
    adresse,
    'DOCUMENT_FICTIF_PRIVE',
    signature,
    'sk_test_fixture_non_secret',
    'whsec_fixture_non_secret',
  ]) {
    expect(traces).not.toContain(sensible)
  }
})
