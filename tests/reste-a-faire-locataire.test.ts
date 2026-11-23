import { expect, test } from 'vitest'
import { detailDossierOuvert, resteAFaireLocataire } from '@/lib/locataire/reste-a-faire'

test('les gestes du locataire suivent l ordre du dossier', () => {
  expect(
    resteAFaireLocataire({ loyerDeclare: false, aRegler: true, garantDesigne: false }),
  ).toEqual(['loyer', 'paiement'])
  expect(resteAFaireLocataire({ loyerDeclare: true, aRegler: true, garantDesigne: false })).toEqual(
    ['paiement'],
  )
  expect(
    resteAFaireLocataire({ loyerDeclare: true, aRegler: false, garantDesigne: false }),
  ).toEqual(['garant'])
  expect(resteAFaireLocataire({ loyerDeclare: true, aRegler: false, garantDesigne: true })).toEqual(
    [],
  )
})

test('le bandeau ouvert dit la meme chose que la liste', () => {
  expect(detailDossierOuvert({ loyerDeclare: false, aRegler: true, garantDesigne: false })).toBe(
    'loyer',
  )
  expect(detailDossierOuvert({ loyerDeclare: true, aRegler: true, garantDesigne: false })).toBe(
    'paiement',
  )
  expect(detailDossierOuvert({ loyerDeclare: true, aRegler: false, garantDesigne: false })).toBe(
    'garant',
  )
  expect(detailDossierOuvert({ loyerDeclare: true, aRegler: false, garantDesigne: true })).toBe(
    'attente',
  )
})
