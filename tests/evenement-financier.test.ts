import { expect, test } from 'vitest'
import { extraireEvenementFinancier } from '@/lib/paiement/evenement-financier'
const dossier = '11111111-1111-4111-8111-111111111111'

test('un autre produit sans contexte de dossier nest pas un paiement Cloison', () => {
  expect(
    extraireEvenementFinancier(creer({ metadata: {}, client_reference_id: 'produit-externe' })),
  ).toBeNull()
})
const creer = (surcharge: Record<string, unknown> = {}) => ({
  id: 'evt_fictif',
  created: Math.floor(Date.now() / 1000),
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_fictif',
      payment_intent: 'pi_fictif',
      payment_status: 'paid',
      mode: 'payment',
      amount_total: 900,
      currency: 'eur',
      metadata: { dossier_id: dossier },
      customer_email: 'PRIVE@example.invalid',
      ...surcharge,
    },
  },
})
test('le paiement conserve son montant historique et ne transporte aucune adresse', () => {
  const lu = extraireEvenementFinancier(
    creer({
      amount_total: 1200,
      metadata: { dossier_id: dossier, tarif_version: 'locataire-futur' },
    }),
  )!
  expect(lu.parametres.montant).toBe(1200)
  expect(lu.parametres.version_tarif).toBe('locataire-futur')
  expect(JSON.stringify(lu)).not.toContain('PRIVE')
})
test('deux identifiants contradictoires ne peuvent pas choisir le dossier a crediter', () => {
  expect(() =>
    extraireEvenementFinancier(
      creer({ client_reference_id: '22222222-2222-4222-8222-222222222222' }),
    ),
  ).toThrow()
})
test.each([0, -1, NaN, 900.5])('le montant %s est refuse', (montant) => {
  expect(() => extraireEvenementFinancier(creer({ amount_total: montant }))).toThrow()
})
test('un remboursement et un litige sont reduits aux references et montants', () => {
  const remboursement = extraireEvenementFinancier({
    id: 'evt_refund',
    created: 1,
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_fictif',
        payment_intent: { id: 'pi_fictif' },
        amount_refunded: 500,
        currency: 'eur',
        billing_details: { email: 'PRIVE' },
      },
    },
  })!
  expect(remboursement.rpc).toBe('enregistrer_suivi_paiement')
  expect(remboursement.parametres.montant).toBe(500)
  expect(JSON.stringify(remboursement)).not.toContain('PRIVE')
})
