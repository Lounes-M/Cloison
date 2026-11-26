import { expect, test } from 'vitest'
import { ligneAccesGarant } from '@/lib/journal/ligne-garant'

const QUAND = '2026-11-25T07:55:00.000Z'
const NUIT = '2026-11-25T23:30:00.000Z'
const ETE = '2026-07-25T22:30:00.000Z'

test('l heure est celle de Paris, hiver comme ete, et le texte le dit', () => {
  const hiver = ligneAccesGarant(
    { action: 'piece_ouverte', acteur: 'garant', identite: null, quand: QUAND },
    'fr',
    null,
  )
  expect(hiver.horloge).toBe('25/11/2026 08:55 (heure de Paris)')
  expect(hiver.texte).toBe('25/11/2026 08:55 (heure de Paris) : Pièce ouverte par vous.')
  expect(
    ligneAccesGarant(
      { action: 'piece_ouverte', acteur: 'garant', identite: null, quand: NUIT },
      'fr',
      null,
    ).horloge,
  ).toBe('26/11/2026 00:30 (heure de Paris)')
  expect(
    ligneAccesGarant(
      { action: 'piece_ouverte', acteur: 'garant', identite: null, quand: ETE },
      'fr',
      null,
    ).horloge,
  ).toBe('26/07/2026 00:30 (heure de Paris)')
})

test('l auteur est vous, le locataire, ou l agence, jamais une adresse interdite', () => {
  const secret = 'personne@example.invalid'
  const garant = ligneAccesGarant(
    { action: 'piece_deposee', acteur: 'garant', identite: secret, quand: QUAND },
    'fr',
    'Logis Lyon',
  )
  expect(garant.texte).toContain('par vous.')
  expect(garant.texte).not.toContain(secret)
  expect(garant.texte).not.toContain('Logis Lyon')

  const locataire = ligneAccesGarant(
    { action: 'dossier_consulte', acteur: 'locataire', identite: secret, quand: QUAND },
    'fr',
    'Logis Lyon',
  )
  expect(locataire.texte).toContain('par le locataire.')
  expect(locataire.texte).not.toContain(secret)

  const nommee = ligneAccesGarant(
    { action: 'piece_ouverte', acteur: 'agence', identite: null, quand: QUAND },
    'fr',
    'Logis Lyon',
  )
  expect(nommee.texte).toContain('par l’agence Logis Lyon.')
  expect(nommee.texte).not.toContain('@')

  const courriel = 'cabinet@logis-lyon.fr'
  const precise = ligneAccesGarant(
    { action: 'piece_ouverte', acteur: 'agence', identite: courriel, quand: QUAND },
    'fr',
    'Logis Lyon',
  )
  expect(precise.texte).toContain(`par l’agence Logis Lyon (${courriel}).`)

  const sansNom = ligneAccesGarant(
    { action: 'piece_ouverte', acteur: 'agence', identite: null, quand: QUAND },
    'fr',
    null,
  )
  expect(sansNom.texte).toContain('par l’agence.')
  expect(sansNom.texte).not.toContain('Logis')
})

test('une action inconnue et un acteur inconnu restent lisibles', () => {
  const ligne = ligneAccesGarant(
    {
      action: 'inconnue',
      acteur: 'autre',
      identite: 'cache@example.invalid',
      quand: 'pas-une-date',
    },
    'fr',
    null,
  )
  expect(ligne.texte).toBe('pas-une-date : Accès par Utilisateur.')
  expect(ligne.texte).not.toContain('cache@example.invalid')
})

test('la ligne anglaise dit Paris time et you', () => {
  const ligne = ligneAccesGarant(
    { action: 'piece_ouverte', acteur: 'garant', identite: null, quand: QUAND },
    'en',
    null,
  )
  expect(ligne.texte).toBe('25/11/2026, 08:55 (Paris time): Document opened by you.')
})
