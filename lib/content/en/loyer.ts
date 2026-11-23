import type { Textes } from '@/lib/i18n'
import type { loyerSaisi as Fr } from '../loyer'

export const loyerSaisi: Textes<typeof Fr> = {
  illisible: 'The rent cannot be read. Example: 850 or 850.50.',
  negatif: 'The rent must be greater than zero.',
  plafond: 'The monthly rent cannot exceed 100,000 €.',
}
