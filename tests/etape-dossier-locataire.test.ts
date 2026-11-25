import { expect, test } from 'vitest'
import { friseDepuisEtape } from '@/lib/dossiers/frise'
import {
  detailDossierOuvert,
  resteAFaireLocataire,
  suiviLocataire,
  type FaitsDossier,
} from '@/lib/locataire/reste-a-faire'

const base: FaitsDossier = {
  statut: 'ouvert',
  loyerDeclare: true,
  aRegler: false,
  garantDesigne: true,
  agence: true,
  demonstration: false,
}

const etats = (faits: FaitsDossier) => {
  const suivi = suiviLocataire(faits)
  return friseDepuisEtape(suivi.etape, 'fr', faits.garantDesigne)
    .map((e) => `${e.titre}:${e.etat}`)
    .join('|')
}

test.each<[string, Partial<FaitsDossier>, string, string[], string | null]>([
  [
    'loyer',
    { loyerDeclare: false, aRegler: true, garantDesigne: false, agence: false },
    'loyer',
    ['loyer', 'paiement'],
    null,
  ],
  [
    'paiement',
    { aRegler: true, garantDesigne: false, agence: false },
    'paiement',
    ['paiement'],
    null,
  ],
  ['garant', { garantDesigne: false, agence: true }, 'garant', ['garant'], null],
  ['attente', {}, 'attente', [], 'depot'],
  ['depot', { statut: 'depot_en_cours' }, 'depot', [], 'depot'],
  ['rattachement', { statut: 'complet', agence: false }, 'rattachement', ['rattachement'], null],
  ['decision', { statut: 'complet', agence: true }, 'decision', [], 'decision'],
  [
    'demonstration',
    { statut: 'complet', agence: false, demonstration: true },
    'decision',
    [],
    'decision',
  ],
  [
    'insuffisant rattache',
    { statut: 'garant_insuffisant', agence: true },
    'insuffisant',
    [],
    'insuffisant',
  ],
  [
    'insuffisant sans agence',
    { statut: 'garant_insuffisant', agence: false },
    'insuffisantSansAgence',
    [],
    'insuffisant',
  ],
  ['signature', { statut: 'transmis' }, 'signature', [], null],
  ['signe', { statut: 'signe' }, 'signe', [], null],
  ['refuse', { statut: 'refuse' }, 'refuse', [], null],
  ['expire', { statut: 'expire' }, 'expire', [], null],
  ['inconnu', { statut: 'autre' }, 'inconnu', [], null],
])(
  '%s : bandeau, gestes et attente viennent de la meme etape',
  (_nom, partiel, cle, gestes, attente) => {
    const suivi = suiviLocataire({ ...base, ...partiel })
    expect(suivi.cle).toBe(cle)
    expect(suivi.gestes).toEqual(gestes)
    expect(suivi.attente).toBe(attente)
    const courantes = friseDepuisEtape(
      suivi.etape,
      'fr',
      suivi.etape !== 'loyer' && { ...base, ...partiel }.garantDesigne !== false,
    )
    expect(courantes.filter((e) => e.etat === 'encours' || e.etat === 'arrete')).toHaveLength(
      suivi.etape === 'signe' ? 0 : 1,
    )
  },
)

test('un dossier complet sans agence ne dit pas que la decision est en cours', () => {
  const faits = { ...base, statut: 'complet', agence: false }
  const titres = etats(faits)
  expect(titres).toContain('Rattachement à ton agence:encours')
  expect(titres).not.toContain('Décision de l’agence:encours')
  expect(suiviLocataire(faits).cle).toBe('rattachement')
  expect(suiviLocataire(faits).gestes).toEqual(['rattachement'])
})

test('un dossier complet rattache attend la decision, pas le depot du garant', () => {
  const faits = { ...base, statut: 'complet', agence: true }
  expect(etats(faits)).toContain('Décision de l’agence:encours')
  expect(suiviLocataire(faits).attente).toBe('decision')
  expect(suiviLocataire(faits).gestes).toEqual([])
})

test('les gestes ouverts restent ceux de la liste historique', () => {
  expect(
    resteAFaireLocataire({ loyerDeclare: false, aRegler: true, garantDesigne: false }),
  ).toEqual(['loyer', 'paiement'])
  expect(detailDossierOuvert({ loyerDeclare: true, aRegler: false, garantDesigne: true })).toBe(
    'attente',
  )
})
