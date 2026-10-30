import { expect, test } from 'vitest'
import { resteAFaireLocataire } from '@/lib/locataire/reste-a-faire'

test('les gestes du locataire suivent l ordre du dossier', () => {
  expect(
    resteAFaireLocataire({ loyerDeclare: false, aRegler: true, garantDesigne: false }),
  ).toEqual(['loyer', 'paiement', 'garant'])
  expect(
    resteAFaireLocataire({ loyerDeclare: true, aRegler: false, garantDesigne: false }),
  ).toEqual(['garant'])
  expect(resteAFaireLocataire({ loyerDeclare: true, aRegler: false, garantDesigne: true })).toEqual(
    [],
  )
})
