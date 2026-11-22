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

test('un montant entier en chiffres ne masque pas des centimes en lettres', () => {
  const texte = 'caution payer defaillance douze mille euros et cinquante centimes (12000 euros)'
  expect(verifierMention(texte, false).ok).toBe(false)
  expect(verifierMention(texte.replace('cinquante', 'zero'), false).ok).toBe(true)
})
test('ne choisit pas arbitrairement un plafond parmi plusieurs montants divergents', () => {
  expect(
    verifierMention(
      'caution payer defaillance douze mille euros (12000 euros), treize mille euros (13000 euros)',
      false,
    ).ok,
  ).toBe(false)
})

// La loi ne fournit aucun modele ; ces phrases reprennent ses termes, comme le
// fera un garant qui recopie l'article 2297.
const LEGALE =
  "En me portant caution de Jean Dupont, je m'engage à rembourser au bailleur les sommes dues " +
  "si le locataire n'y satisfait pas lui-même, dans la limite de 28 800 euros " +
  '(vingt-huit mille huit cents euros), pour un loyer de 800 euros.'

test('une mention aux termes de la loi passe, loyer cite compris', () => {
  expect(verifierMention(LEGALE, false)).toEqual({ ok: true, montantEuros: 28_800 })
})
test('la formule legale de la solidarite suffit, malgre sa negation', () => {
  const solidaire =
    LEGALE +
    " Je reconnais ne pouvoir exiger du bailleur qu'il poursuive d'abord le locataire ni qu'il divise ses poursuites entre les cautions."
  expect(verifierMention(LEGALE, true)).toEqual({ ok: false, manques: ['solidarite'] })
  expect(verifierMention(solidaire, true)).toEqual({ ok: true, montantEuros: 28_800 })
})
test.each([
  'Je ne paierai pas en cas de defaillance, caution, douze mille euros (12000 euros).',
  "Je n'accepte pas d'etre caution ni de payer en cas de defaillance, douze mille euros (12000 euros).",
  'Je ne m’engage pas comme caution a payer en cas de defaillance, douze mille euros (12000 euros).',
])('la negation a la premiere personne reste refusee : %s', (texte) => {
  expect(verifierMention(texte, false).ok).toBe(false)
})
test('un loyer impaye ou une phrase negative sans rapport ne bloque pas', () => {
  expect(
    verifierMention(
      "Je me porte caution et je paierai les loyers impayes, sans jamais depasser douze mille euros (12 000 euros). Le bail n'a pas encore commence.",
      false,
    ),
  ).toEqual({ ok: true, montantEuros: 12_000 })
})
