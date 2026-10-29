import { expect, test } from 'vitest'
import { etapesGarant, etapesLocataire } from '@/lib/dossiers/frise'

const etats = (etapes: { etat: string }[]) => etapes.map((e) => e.etat).join(',')

test.each([
  ['ouvert', false, 'fait,encours,avenir,avenir,avenir'],
  ['ouvert', true, 'fait,fait,encours,avenir,avenir'],
  ['depot_en_cours', true, 'fait,fait,encours,avenir,avenir'],
  ['garant_insuffisant', true, 'fait,fait,arrete,avenir,avenir'],
  ['complet', true, 'fait,fait,fait,encours,avenir'],
  ['refuse', true, 'fait,fait,fait,arrete,avenir'],
  ['transmis', true, 'fait,fait,fait,fait,encours'],
  ['signe', true, 'fait,fait,fait,fait,fait'],
])('locataire, statut %s (garant %s)', (statut, garant, attendu) => {
  expect(etats(etapesLocataire(statut, garant))).toBe(attendu)
})

test.each([
  ['ouvert', false, 'fait,encours,avenir,avenir'],
  ['depot_en_cours', true, 'fait,fait,encours,avenir'],
  ['refuse', true, 'fait,fait,arrete,avenir'],
  ['transmis', true, 'fait,fait,fait,encours'],
  ['signe', true, 'fait,fait,fait,fait'],
])('garant, statut %s (depot %s)', (statut, depot, attendu) => {
  expect(etats(etapesGarant(statut, depot))).toBe(attendu)
})

test('le garant ne lit aucun verdict : complet et garant insuffisant donnent la meme frise', () => {
  for (const depot of [false, true])
    expect(etapesGarant('garant_insuffisant', depot)).toEqual(etapesGarant('complet', depot))
})

test('une seule etape courante au plus, et toujours dans l’ordre', () => {
  for (const statut of [
    'ouvert',
    'depot_en_cours',
    'complet',
    'garant_insuffisant',
    'transmis',
    'refuse',
    'signe',
    'inconnu',
  ]) {
    for (const etapes of [etapesLocataire(statut, true), etapesGarant(statut, true)]) {
      const rangs = etapes.map((e) => ['fait', 'encours', 'arrete', 'avenir'].indexOf(e.etat))
      expect(rangs).toEqual([...rangs].sort((a, b) => a - b))
      expect(
        etapes.filter((e) => e.etat === 'encours' || e.etat === 'arrete').length,
      ).toBeLessThanOrEqual(1)
    }
  }
})
