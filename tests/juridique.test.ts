import { afterEach, expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import PageConditions from '@/app/(marketing)/conditions/page'
import PageConfidentialite from '@/app/(marketing)/confidentialite/page'
import PageMentionsLegales from '@/app/(marketing)/mentions-legales/page'
import { editeur, retentionSauvegardes } from '@/lib/juridique/editeur'

const COMPLET = {
  EDITEUR_DENOMINATION: 'Cloison Fixture',
  EDITEUR_FORME: 'SAS',
  EDITEUR_SIREN: '552 100 554',
  EDITEUR_ADRESSE: '1 rue des essais, 75000 Paris',
  EDITEUR_COURRIEL: 'contact@example.fr',
  EDITEUR_DIRECTEUR_PUBLICATION: 'Directeur Fixture',
  MEDIATEUR_NOM: 'Mediateur Fixture',
  MEDIATEUR_SITE: 'https://mediateur.example.fr',
  SAUVEGARDE_RETENTION_JOURS: '7',
}

function poser(valeurs: Record<string, string | undefined>) {
  for (const [nom, valeur] of Object.entries(valeurs)) vi.stubEnv(nom, valeur ?? '')
}
const rendre = (page: () => React.ReactElement) => renderToStaticMarkup(createElement(page))

afterEach(() => {
  vi.unstubAllEnvs()
})

test('sans configuration, chaque champ obligatoire est signale manquant', () => {
  poser({ EDITEUR_DENOMINATION: '', EMAIL_SUPPORT: '' })
  expect(editeur().manquants).toEqual([
    'denomination',
    'forme',
    'siren',
    'adresse',
    'courriel',
    'directeurPublication',
    'mediateur',
  ])
})

test('une valeur mal formee vaut absente, jamais affichee telle quelle', () => {
  poser({
    ...COMPLET,
    EDITEUR_SIREN: '12345',
    EDITEUR_COURRIEL: 'javascript:alert(1)',
    MEDIATEUR_SITE: 'http://mediateur.example.fr',
  })
  const e = editeur()
  expect(e.siren).toBeNull()
  expect(e.courriel).toBeNull()
  expect(e.mediateur).toBeNull()
  expect(e.manquants).toEqual(['siren', 'courriel', 'mediateur'])
})

test('une configuration complete ne laisse rien a completer, SIREN mis en forme', () => {
  poser(COMPLET)
  const e = editeur()
  expect(e.manquants).toEqual([])
  expect(e.siren).toBe('552 100 554')
})

test('l adresse de support sert de contact par defaut', () => {
  poser({ ...COMPLET, EDITEUR_COURRIEL: '', EMAIL_SUPPORT: 'support@example.fr' })
  expect(editeur().courriel).toBe('support@example.fr')
})

test.each([
  ['mentions', PageMentionsLegales],
  ['confidentialite', PageConfidentialite],
  ['conditions', PageConditions],
])('la page %s porte le marqueur tant que l editeur manque', (_nom, page) => {
  poser({ EDITEUR_DENOMINATION: '', EMAIL_SUPPORT: '', EDITEUR_COURRIEL: '' })
  const html = rendre(page)
  expect(html).toContain('data-editeur-incomplet')
  expect(html).toContain('<h1')

  poser(COMPLET)
  expect(rendre(page)).not.toContain('data-editeur-incomplet')
})

test('les mentions affichent l editeur et l hebergeur de l application', () => {
  poser(COMPLET)
  const html = rendre(PageMentionsLegales)
  for (const attendu of ['Cloison Fixture', '552 100 554', 'Directeur Fixture', 'Vercel Inc.'])
    expect(html).toContain(attendu)
  expect(html).toContain('href="mailto:contact@example.fr"')
})

test('la politique ne cite OpenRouter et le prestataire de signature que s ils sont actives', () => {
  poser({ ...COMPLET, OCR_ACTIVE: '', SIGNATURE_PARCOURS_ENABLED: '' })
  const coupe = rendre(PageConfidentialite)
  expect(coupe).not.toContain('OpenRouter')
  expect(coupe).not.toContain('Docage')
  expect(coupe).not.toContain('Youtrust')

  poser({ OCR_ACTIVE: 'true', SIGNATURE_PARCOURS_ENABLED: 'true' })
  const actif = rendre(PageConfidentialite)
  expect(actif).toContain('OpenRouter')
  expect(actif).toContain('Docage')
  expect(actif).not.toContain('Youtrust')

  poser({ SIGNATURE_PARCOURS_ENABLED: 'true', SIGNATURE_PRESTATAIRE: 'youtrust' })
  const secours = rendre(PageConfidentialite)
  expect(secours).toContain('Youtrust')
  expect(secours).not.toContain('Docage')
})

test('les conditions annoncent la retractation au prorata et le mediateur configure', () => {
  poser(COMPLET)
  const html = rendre(PageConditions)
  expect(html).toContain('quatorze jours')
  expect(html).toContain('déduction faite de la part')
  expect(html).toContain('Mediateur Fixture')
  expect(html).toContain('href="https://mediateur.example.fr/"')
})

test('la politique dit la duree des sauvegardes, ou reste incomplete', () => {
  poser({ ...COMPLET, SAUVEGARDE_RETENTION_JOURS: '' })
  expect(rendre(PageConfidentialite)).toContain('data-editeur-incomplet')
  for (const invalide of ['0', '400', '7j']) {
    poser({ SAUVEGARDE_RETENTION_JOURS: invalide })
    expect(retentionSauvegardes()).toBeNull()
  }

  poser({ ...COMPLET, SAUVEGARDE_RETENTION_JOURS: '7' })
  const html = rendre(PageConfidentialite)
  expect(html).not.toContain('data-editeur-incomplet')
  expect(html).toContain('conservées 7 jours au plus')
})

test('le prix porte la mention fiscale de l editeur', () => {
  poser({ ...COMPLET, EDITEUR_TVA: '' })
  expect(rendre(PageConditions)).toContain('article 293 B du CGI')
  poser({ EDITEUR_TVA: 'FR12345678901' })
  const html = rendre(PageConditions)
  expect(html).toContain('toutes taxes comprises')
  expect(html).not.toContain('293 B')
})
