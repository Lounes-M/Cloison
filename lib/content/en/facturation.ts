import type { Textes } from '@/lib/i18n'
import type { facturation as Fr } from '../facturation'

export const facturation: Textes<typeof Fr> = {
  etiquette: 'Agency management',
  lien: 'Payments',
  titre: 'Payments for deeds',
  explication:
    'A payment is created once a deed is signed and fully archived. No agency payment is created in the sandbox.',
  aucun: 'No deed to pay for.',
  aucunAide: 'Payments appear here once deeds are signed and fully archived.',
  date: 'Created on',
  montant: 'Amount',
  etat: 'Payment status',
  payer: 'Pay by card',
  suite: 'Next page',
  retour: 'Back to the agency space',
  indisponible:
    'The payment could not be confirmed. Tracking remains available; no new uncertain attempt will be created.',
  suspendu: 'Online payment is temporarily unavailable.',
  anomalie: 'Reconciliation to review',
  etats: {
    a_regler: 'To pay',
    reserve: 'Payment prepared',
    ouvert: 'Payment pending',
    paye: 'Paid',
    rembourse: 'Refund to reconcile',
    litige: 'Dispute to review',
  },
}
