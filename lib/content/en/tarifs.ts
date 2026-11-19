import { tarifs } from '../tarifs'

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
