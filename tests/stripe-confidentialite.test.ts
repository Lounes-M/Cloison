import { afterEach, expect, test, vi } from 'vitest'
import Stripe from 'stripe'
import { clientServeur } from '@/lib/acces/serveur'

vi.mock('@/lib/acces/serveur', () => ({ clientServeur: vi.fn() }))

vi.mock('@/lib/env', () => ({
  env: {
    stripeSecretKey: 'sk_test_fixture_non_secret',
    stripeWebhookSecret: 'whsec_fixture_non_secret',
  },
}))
import { creerSessionLocataire, lireEvenement } from '@/lib/paiement/stripe'

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

test('une vraie erreur SDK Stripe de creation ne divulgue pas son message ni son raw', async () => {
  const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
  const adresse = 'session-confidentielle@example.invalid'
  const erreur = new Stripe.errors.StripeInvalidRequestError({
    type: 'invalid_request_error',
    code: 'email_invalid',
    param: 'customer_email',
    message: `Invalid email address: ${adresse}`,
  })
  // L'objet est celui du SDK reel, et son raw contient effectivement la donnee.
  // Le rejet est injecte avant tout appel reseau : ce n'est pas un incident observe.
  expect(erreur).toBeInstanceOf(Stripe.errors.StripeError)
  expect(JSON.stringify(erreur.raw)).toContain(adresse)
  vi.mocked(clientServeur).mockRejectedValueOnce(erreur)
  expect(
    await creerSessionLocataire({
      dossierId: '11111111-1111-4111-8111-111111111111',
      reference: 'REFERENCE_FICTIVE_PRIVEE',
      email: adresse,
      retourOk: 'https://example.invalid/ok',
      retourAnnule: 'https://example.invalid/annule',
    }),
  ).toBeNull()
  expect(journal).toHaveBeenCalledOnce()
  const traces = JSON.stringify(journal.mock.calls)
  for (const sensible of [
    adresse,
    erreur.message,
    'REFERENCE_FICTIVE_PRIVEE',
    'sk_test_fixture_non_secret',
    'whsec_fixture_non_secret',
  ])
    expect(traces).not.toContain(sensible)
})
