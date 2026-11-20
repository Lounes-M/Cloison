import type { Textes } from '@/lib/i18n'
import { tarifs, type paiementLocataire as Fr } from '../tarifs'

/** Les montants en anglais : le symbole avant le nombre. */
export const euros = (centimes: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(centimes / 100)

export const prixLocataire = euros(tarifs.locataireCents)
export const prixActe = euros(tarifs.acteCents)

export const paiementLocataire: Textes<typeof Fr> = {
  titre: 'Pay for your file',
  prix: prixLocataire,
  texte:
    'Once, for three months of vault: your guarantor uploads their documents separately, the agency receives a complete file, and you follow its progress.',
  regle:
    'You can withdraw for fourteen days: you are then refunded, less the share of the three months already elapsed. After that, the payment is final even if the file expires without a decision from the agency: you are buying three months of vault, not an outcome.',
  accordConditions: 'I accept the Cloison terms.',
  lienConditions: 'Read the terms',
  executionImmediate:
    'I ask for the service to start straight away, so that my guarantor receives their link without waiting. If I withdraw within fourteen days, I pay for the share already provided.',
  accordsManquants: 'Tick both boxes to pay for your file.',
  attente: 'Your guarantor’s link will be sent once the file is paid for.',
  bouton: `Pay ${prixLocataire}`,
  boutonPour: (montant) => `Pay ${euros(montant)}`,
  envoi: 'Redirecting…',
  regle_le: (date) => `File paid for on ${date}.`,
  indisponible: 'Payment is not available right now. Try again in a moment.',
  annule: 'Payment cancelled. Your file stays open: you can pay whenever you like.',
  confirme: 'Thank you, your payment is recorded. You can name your guarantor.',
  enAttente: 'Payment being confirmed. Refresh in a few seconds.',
}
