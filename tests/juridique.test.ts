import { afterEach, expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import PageConditions from '@/app/(marketing)/conditions/page'
import PageConfidentialite from '@/app/(marketing)/confidentialite/page'
import PageMentionsLegales from '@/app/(marketing)/mentions-legales/page'
import { editeur, retentionSauvegardes } from '@/lib/juridique/editeur'

const COMPLET = {
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

test('sans mediateur declare, il est signale manquant', () => {
  poser({ MEDIATEUR_NOM: '', MEDIATEUR_SITE: '' })
  expect(editeur().manquants).toEqual(['mediateur'])
})

test('un site de mediateur qui n est pas en https vaut absent', () => {
  poser({ ...COMPLET, MEDIATEUR_SITE: 'http://mediateur.example.fr' })
  const e = editeur()
  expect(e.mediateur).toBeNull()
  expect(e.manquants).toEqual(['mediateur'])
})

test('une configuration complete ne laisse rien a completer', () => {
  poser(COMPLET)
  expect(editeur().manquants).toEqual([])
})

test('l identite de l editeur vient du contenu et suit la langue, pas les variables', () => {
  poser({
    ...COMPLET,
    EDITEUR_DENOMINATION: 'Autre Societe',
    EDITEUR_DIRECTEUR_PUBLICATION: 'Quelqu un',
  })
  const francais = editeur('fr')
  expect(francais.denomination).toBe('LM Services')
  expect(francais.siren).toBe('994 493 435')
  expect(francais.directeurPublication).toBe('Le président de LM Services')
  const anglais = editeur('en')
  expect(anglais.denomination).toBe('LM Services')
  expect(anglais.directeurPublication).toBe('The chair (président) of LM Services')
  expect(anglais.forme).toContain('single-shareholder')
})

test.each([
  ['mentions', PageMentionsLegales],
  ['conditions', PageConditions],
])('la page %s porte le marqueur tant que le mediateur manque', (_nom, page) => {
  poser({ ...COMPLET, MEDIATEUR_NOM: '' })
  const html = rendre(page)
  expect(html).toContain('data-editeur-incomplet')
  expect(html).toContain('<h1')

  poser(COMPLET)
  expect(rendre(page)).not.toContain('data-editeur-incomplet')
})

test('les mentions affichent l editeur et l hebergeur de l application', () => {
  poser(COMPLET)
  const html = rendre(PageMentionsLegales)
  for (const attendu of ['LM Services', '994 493 435', 'Le président de LM Services', 'Francfort'])
    expect(html).toContain(attendu)
  // L'hebergement est decrit sans nommer les prestataires.
  for (const absent of ['Vercel', 'Supabase']) expect(html).not.toContain(absent)
  expect(html).toContain('href="mailto:contact@cloison.immo"')
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

test('sans variable posee, les pages nomment la societe qui exploite la marque', () => {
  poser({ MEDIATEUR_NOM: '', MEDIATEUR_SITE: '', SAUVEGARDE_RETENTION_JOURS: '', EDITEUR_TVA: '' })
  const mentions = rendre(PageMentionsLegales)
  // Cloison est une marque : l'editeur nomme est la societe immatriculee qui l'exploite.
  for (const attendu of [
    'LM Services',
    'SASU, société par actions simplifiée unipersonnelle',
    '1 000 €',
    '994 493 435',
    '994 493 435 R.C.S. Paris',
    '231 rue Saint-Honoré, 75001 Paris',
    'contact@cloison.immo',
  ])
    expect(mentions).toContain(attendu)
  expect(mentions).not.toContain('En cours d’immatriculation')
  expect(mentions).not.toContain('À compléter')
  // La supervision, elle, continue de reclamer le mediateur.
  expect(mentions).toContain('data-editeur-incomplet')

  const confidentialite = rendre(PageConfidentialite)
  expect(confidentialite).toContain(
    'Le responsable du traitement est LM Services, éditeur de Cloison',
  )
  expect(confidentialite).toContain('conservées 7 jours au plus')
  expect(confidentialite).toContain('Cookies et courriels')
  expect(confidentialite).not.toContain('À compléter')

  const conditions = rendre(PageConditions)
  expect(conditions).toContain('article L. 612-1 du code de la consommation')
  expect(conditions).toContain('article 293 B du CGI')
})
