import { expect, test } from 'vitest'
import { montantsEnChiffres, verifierMention } from '@/lib/garant/mention'

test('le non-paiement du locataire ne devient pas un refus du garant', () => {
  expect(
    verifierMention(
      'Je me porte caution et je paierai si le locataire ne paie pas, pour douze mille euros (12000 euros).',
      false,
    ).ok,
  ).toBe(true)
})
test('la negation de son propre engagement reste refusee', () => {
  expect(
    verifierMention(
      'Je ne me porte pas caution et refuse de payer en cas de defaillance, douze mille euros (12000 euros).',
      false,
    ).ok,
  ).toBe(false)
})

test.each(['12000,50 euros', '12 000,50 €', '12.000,50 EUR', '12000.50 euros'])(
  'lit le montant entier, centimes compris : %s',
  (texte) => {
    expect(montantsEnChiffres(texte)).toEqual([12000.5])
  },
)
test.each(['-12000 euros', '12000,123 euros', '12,000,50 euros'])(
  'ne recupere pas un fragment du montant mal forme : %s',
  (texte) => {
    expect(montantsEnChiffres(texte)).toEqual([])
  },
)
test('compare les centimes en chiffres et en lettres', () => {
  const texte = 'caution payer defaillance douze mille euros et cinquante centimes (12000,50 euros)'
  expect(verifierMention(texte, false)).toEqual({ ok: true, montantEuros: 12000.5 })
  expect(verifierMention(texte.replace('cinquante', 'soixante'), false).ok).toBe(false)
})
test('ne choisit pas arbitrairement un plafond parmi plusieurs montants divergents', () => {
  expect(
    verifierMention(
      'caution payer defaillance douze mille euros (12000 euros), treize mille euros (13000 euros)',
      false,
    ).ok,
  ).toBe(false)
})
