import { expect, test } from 'vitest'

import * as courrielsEn from '@/lib/content/en/courriels'
import * as courrielsFr from '@/lib/content/courriels'
import { liens as liensEn } from '@/lib/content/en/liens'
import { liens as liensFr } from '@/lib/content/liens'
import { composerCourriel, echapper } from '@/lib/courriels/gabarit'
import { courrielsPour } from '@/lib/courriels/notifications'

const SITE = 'https://cloison.example'

test('le HTML et le texte disent la meme chose, dans la langue demandee', () => {
  const corps = composerCourriel(
    {
      langue: 'en',
      espace: 'garant',
      sujet: 'Subject',
      titre: 'Title',
      paragraphes: ['First paragraph.', 'Second paragraph.'],
      bouton: { url: `${SITE}/lien/abc` },
      notes: ['A note.'],
      details: [{ libelle: 'File reference', valeur: 'ABCD1234' }],
    },
    SITE,
  )
  for (const morceau of ['Title', 'First paragraph.', 'Second paragraph.', 'A note.', 'ABCD1234']) {
    expect(corps.text).toContain(morceau)
    expect(corps.html).toContain(morceau)
  }
  expect(corps.text).toContain(`${SITE}/lien/abc`)
  expect(corps.html).toContain(`href="${SITE}/lien/abc"`)
  expect(corps.html).toContain('<html lang="en">')
  expect(corps.html).toContain('Guarantor space')
  expect(corps.html).toContain(`${SITE}/en/mentions-legales`)
  expect(corps.html).not.toContain('Espace garant')
})

test('rien de distant ne se charge a l’ouverture : ni image, ni script, ni feuille de style', () => {
  const { html } = composerCourriel(
    { langue: 'fr', espace: 'agence', sujet: 'Sujet', paragraphes: ['Texte.'] },
    SITE,
  )
  expect(html).not.toMatch(/<img|<script|<link|@import|url\(/i)
})

test('une saisie hostile ne devient jamais du HTML', () => {
  const hostile = '<img src=x onerror=alert(1)>"&\''
  const { html } = composerCourriel(
    {
      langue: 'fr',
      espace: 'garant',
      sujet: hostile,
      paragraphes: [hostile],
      details: [{ libelle: hostile, valeur: hostile }],
      notes: [hostile],
    },
    SITE,
  )
  expect(html).not.toContain('<img')
  expect(html).toContain(echapper(hostile))
})

test('un lien qui n’est pas en http(s) ne produit aucun bouton', () => {
  const { html } = composerCourriel(
    {
      langue: 'fr',
      espace: 'garant',
      sujet: 'Sujet',
      paragraphes: ['Texte.'],
      bouton: { url: 'javascript:alert(1)' },
    },
    SITE,
  )
  expect(html).not.toContain('javascript:')
})

test('chaque courriel de statut existe dans les deux langues', () => {
  for (const groupe of ['locataire', 'garant', 'agence', 'cloture'] as const)
    expect(Object.keys(courrielsEn[groupe]).sort()).toEqual(Object.keys(courrielsFr[groupe]).sort())
  expect(liensEn.fin('X')).toContain('X')
  expect(liensEn.garant.sujet('a@b.fr', 'REF')).toContain('REF')
  expect(liensFr.locataire.sujet('REF')).toContain('REF')
})

test('chaque destinataire lit sa langue, et les contacts d’une agence sont groupes par langue', () => {
  const dossier = {
    id: '11111111-1111-4111-8111-111111111111',
    reference: 'ABCD1234',
    statut: 'complet',
    email_locataire: 'locataire@example.invalid',
    email_garant: 'garant@example.invalid',
    demonstration: false,
  }
  const langueDe = (adresse: string) =>
    adresse === 'locataire@example.invalid' || adresse === 'b@agence.invalid' ? 'en' : 'fr'
  const envois = courrielsPour(dossier, ['a@agence.invalid', 'b@agence.invalid'], langueDe)
  const locataire = envois.find((e) => e.categorie === 'locataire')!
  expect(locataire.sujet).toBe(courrielsEn.locataire.complet!.sujet)
  expect(locataire.html).toContain('<html lang="en">')
  // Aucun lien de capacite, et aucun bouton, pour un porteur.
  expect(locataire.texte).not.toContain('/lien/')
  expect(locataire.html).not.toContain('border-radius:999px;background:#035946')
  const agence = envois.filter((e) => e.categorie === 'agence')
  expect(agence.map((e) => e.a)).toEqual([['a@agence.invalid'], ['b@agence.invalid']])
  expect(agence[0]!.sujet).toBe(courrielsFr.agence.complet!.sujet('ABCD1234'))
  expect(agence[1]!.sujet).toBe(courrielsEn.agence.complet!.sujet('ABCD1234'))
  expect(agence[1]!.texte).toContain(`/espace/dossiers/${dossier.id}`)
})
