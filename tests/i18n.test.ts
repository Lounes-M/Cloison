import { expect, test } from 'vitest'

import * as agencesFr from '@/lib/content/agences'
import * as agencesEn from '@/lib/content/en/agences'
import * as homeEn from '@/lib/content/en/home'
import * as juridiqueEn from '@/lib/content/en/juridique'
import { questions as questionsEn } from '@/lib/content/en/questions'
import * as homeFr from '@/lib/content/home'
import * as juridiqueFr from '@/lib/content/juridique'
import { questions as questionsFr } from '@/lib/content/questions'
import { cheminDansLangue, langueDuChemin, lien } from '@/lib/i18n'

test('un lien interne prend le prefixe de sa langue', () => {
  expect(lien('fr', '/agences')).toBe('/agences')
  expect(lien('en', '/agences')).toBe('/en/agences')
  expect(lien('en', '/')).toBe('/en')
  expect(lien('en', '/#tarifs')).toBe('/en#tarifs')
  expect(lien('en', '/candidater/abc')).toBe('/en/candidater/abc')
})

test('une page sans version anglaise garde son adresse', () => {
  expect(lien('en', '/lien-invalide')).toBe('/lien-invalide')
  expect(lien('en', '/espace')).toBe('/espace')
  expect(lien('en', '#demander')).toBe('#demander')
})

test('la bascule mene a la meme page dans l’autre langue', () => {
  expect(cheminDansLangue('/agences', 'en')).toBe('/en/agences')
  expect(cheminDansLangue('/en/agences', 'fr')).toBe('/agences')
  expect(cheminDansLangue('/en', 'fr')).toBe('/')
  expect(cheminDansLangue('/', 'en')).toBe('/en')
  expect(cheminDansLangue('/en/questions', 'en')).toBe('/en/questions')
  // Une page qui n'existe qu'en francais renvoie a l'accueil anglais.
  expect(cheminDansLangue('/lien-invalide', 'en')).toBe('/en')
  expect(langueDuChemin('/en/demarrer')).toBe('en')
  expect(langueDuChemin('/entree')).toBe('fr')
})

/** La forme d'un contenu : ses cles, sans ses textes. */
function forme(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(forme)
  if (typeof valeur === 'function') return 'fonction'
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(
      Object.entries(valeur)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cle, v]) => [cle, forme(v)]),
    )
  }
  return typeof valeur
}

test('le contenu anglais a la meme forme que le francais', () => {
  expect(forme(questionsEn)).toEqual(forme(questionsFr))
  expect(forme(juridiqueEn.confidentialite)).toEqual(forme(juridiqueFr.confidentialite))
  expect(forme(juridiqueEn.conditions)).toEqual(forme(juridiqueFr.conditions))
  expect(forme(juridiqueEn.mentionsLegales)).toEqual(forme(juridiqueFr.mentionsLegales))
  for (const cle of [
    'problem',
    'spaces',
    'parcours',
    'product',
    'pricing',
    'whyNow',
    'goToMarket',
    'vision',
    'productViews',
    'espacesAccueil',
    'marqueeItems',
  ] as const) {
    expect(forme(homeEn[cle]), cle).toEqual(forme(homeFr[cle]))
  }
  for (const cle of ['commentCaMarche', 'cequonapporte'] as const) {
    expect(forme(agencesEn[cle]), cle).toEqual(forme(agencesFr[cle]))
  }
})

test('aucune page publique ne parle encore de pilote', () => {
  for (const contenu of [homeFr, homeEn, agencesFr, agencesEn, questionsFr, questionsEn]) {
    expect(JSON.stringify(contenu)).not.toMatch(/pilot/i)
  }
})
