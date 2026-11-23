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
  ['ouvert', 'fait,encours,avenir,avenir'],
  ['depot_en_cours', 'fait,encours,avenir,avenir'],
  ['complet', 'fait,fait,encours,avenir'],
  ['garant_insuffisant', 'fait,fait,encours,avenir'],
  ['refuse', 'fait,fait,arrete,avenir'],
  ['transmis', 'fait,fait,fait,encours'],
  ['signe', 'fait,fait,fait,fait'],
])(
  'garant, statut %s : les pieces ne sont terminees que si le serveur les a jugees',
  (statut, attendu) => {
    expect(etats(etapesGarant(statut))).toBe(attendu)
  },
)

test('le garant ne lit aucun verdict : complet et garant insuffisant donnent la meme frise', () => {
  expect(etapesGarant('garant_insuffisant')).toEqual(etapesGarant('complet'))
})

test('tant que le garant n est pas designe, l etape ne dit pas qu il l est', () => {
  expect(etapesLocataire('ouvert', false)[1]?.titre).toBe('Garant à désigner')
  expect(etapesLocataire('ouvert', true)[1]?.titre).toBe('Garant désigné')
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
    for (const etapes of [etapesLocataire(statut, true), etapesGarant(statut)]) {
      const rangs = etapes.map((e) => ['fait', 'encours', 'arrete', 'avenir'].indexOf(e.etat))
      expect(rangs).toEqual([...rangs].sort((a, b) => a - b))
      expect(
        etapes.filter((e) => e.etat === 'encours' || e.etat === 'arrete').length,
      ).toBeLessThanOrEqual(1)
    }
  }
})
