import { afterEach, expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import PageConditions from '@/app/(marketing)/conditions/page'
import PageConfidentialite from '@/app/(marketing)/confidentialite/page'
import PageMentionsLegales from '@/app/(marketing)/mentions-legales/page'
import { PageConfidentialite as PageConfidentialiteEn } from '@/components/pages/PageConfidentialite'
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

test('un site de mediateur qui n est pas en https vaut absent', () => {
  poser({ ...COMPLET, MEDIATEUR_SITE: 'http://mediateur.example.fr' })
  expect(editeur().mediateur).toBeNull()
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
])('la page %s ne reclame pas le mediateur', (_nom, page) => {
  poser({ ...COMPLET, MEDIATEUR_NOM: '', MEDIATEUR_SITE: '' })
  const html = rendre(page)
  expect(html).not.toContain('data-editeur-incomplet')
  expect(html).toContain('<h1')
})

test('les mentions affichent l editeur et l hebergeur de l application', () => {
  poser(COMPLET)
  const html = rendre(PageMentionsLegales)
  for (const attendu of [
    'LM Services',
    '994 493 435',
    'Le président de LM Services',
    'Francfort',
    'Vercel Inc.',
    'Covina',
  ])
    expect(html).toContain(attendu)
  // La base reste un prestataire distinct : son nom n'est pas dans les mentions.
  expect(html).not.toContain('Supabase')
  expect(html).toContain('href="mailto:contact@cloison.immo"')
})

test('la politique dit toujours qu OpenRouter n est pas un hebergement europeen', () => {
  poser({ ...COMPLET, OCR_ACTIVE: '', LECTURE_IA_GARANT: '', SIGNATURE_PARCOURS_ENABLED: '' })
  const coupe = rendre(PageConfidentialite)
  expect(coupe).toContain('OpenRouter, Inc.')
  expect(coupe).toContain('n’est pas un hébergement en Europe')
  expect(coupe).toContain('Aucune pièce n’est envoyée')
  expect(coupe).not.toContain('Docage')
  expect(coupe).not.toContain('Youtrust')

  poser({ OCR_ACTIVE: 'true', SIGNATURE_PARCOURS_ENABLED: 'true' })
  const actif = rendre(PageConfidentialite)
  expect(actif).toContain('ce n’est pas un hébergement européen')
  expect(actif).toContain('imposé en Europe')
  expect(actif).toContain('Docage')
  expect(actif).not.toContain('Youtrust')

  poser({
    OCR_ACTIVE: 'true',
    OPENROUTER_REGION: 'us',
    OPENROUTER_EXTRACTION_FOURNISSEUR: 'openai',
  })
  expect(rendre(PageConfidentialite)).toContain('n’est pas limité à l’Union européenne')

  poser({ SIGNATURE_PARCOURS_ENABLED: 'true', SIGNATURE_PRESTATAIRE: 'youtrust' })
  const secours = rendre(PageConfidentialite)
  expect(secours).toContain('Youtrust')
  expect(secours).not.toContain('Docage')
})

test('les conditions annoncent la retractation au prorata, le tarif agence et le mediateur', () => {
  poser(COMPLET)
  const html = rendre(PageConditions)
  expect(html).toContain('Chaque acte signé et archivé coûte')
  expect(html).toContain('29')
  expect(html).toContain('quatorze jours')
  expect(html).toContain('déduction faite de la part')
  expect(html).toContain('Mediateur Fixture')
  expect(html).toContain('href="https://mediateur.example.fr/"')
})

test('la politique dit la duree des sauvegardes, ou se tait et reste incomplete', () => {
  poser({ ...COMPLET, SAUVEGARDE_RETENTION_JOURS: '' })
  const muette = rendre(PageConfidentialite)
  expect(muette).toContain('data-editeur-incomplet')
  // Aucune duree par defaut : rien n'est affirme sans valeur declaree.
  expect(muette).not.toContain('sauvegardes techniques')
  expect(rendre(() => PageConfidentialiteEn({ langue: 'en' }))).not.toContain('Technical backups')
  for (const invalide of ['0', '400', '7j']) {
    poser({ SAUVEGARDE_RETENTION_JOURS: invalide })
    expect(retentionSauvegardes()).toBeNull()
  }

  poser({ ...COMPLET, SAUVEGARDE_RETENTION_JOURS: '7' })
  const html = rendre(PageConfidentialite)
  expect(html).not.toContain('data-editeur-incomplet')
  expect(html).toContain('conservées 7 jours au plus')
})

test('la politique cite l hebergeur du moteur documentaire seulement s il est branche', () => {
  poser({ ...COMPLET, DOCUMENTAIRE_DISTANT_URL: '', DOCUMENTAIRE_DISTANT_HEBERGEUR: 'Scaleway' })
  const local = rendre(PageConfidentialite)
  expect(local).not.toContain('serveur dédié')
  expect(local).not.toContain('Scaleway')
  expect(local).not.toContain('data-editeur-incomplet')

  poser({ DOCUMENTAIRE_DISTANT_URL: 'https://documentaire.example.fr' })
  const nomme = rendre(PageConfidentialite)
  expect(nomme).toContain('serveur dédié à ce seul traitement, hébergé par Scaleway.')
  expect(nomme).not.toContain('data-editeur-incomplet')
  expect(rendre(() => PageConfidentialiteEn({ langue: 'en' }))).toContain('hosted by Scaleway.')

  // Branche sans hebergeur declare : la page le dit sans nom et reste a completer.
  poser({ DOCUMENTAIRE_DISTANT_HEBERGEUR: '' })
  const anonyme = rendre(PageConfidentialite)
  expect(anonyme).toContain('chez un hébergeur distinct de ceux cités plus haut')
  expect(anonyme).toContain('data-editeur-incomplet')
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
  expect(mentions).not.toContain('data-editeur-incomplet')

  const confidentialite = rendre(PageConfidentialite)
  expect(confidentialite).toContain(
    'Le responsable du traitement est LM Services, éditeur de Cloison',
  )
  expect(confidentialite).not.toContain('jours au plus, puis écrasées')
  expect(confidentialite).toContain('Cookies et courriels')
  expect(confidentialite).not.toContain('À compléter')

  const conditions = rendre(PageConditions)
  expect(conditions).toContain('article L. 612-1 du code de la consommation')
  expect(conditions).toContain('article 293 B du CGI')
})
