import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResteAFaireGarant } from '@/components/dossiers/ResteAFaireGarant'
import { resteAFaire } from '@/lib/content/garant'
import { etapesGarant, etapesLocataire, garantAttendAgence } from '@/lib/dossiers/frise'

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
  expect(etapesGarant('garant_insuffisant', 'fr', { agence: false })).toEqual(
    etapesGarant('complet', 'fr', { agence: false }),
  )
})

test('un dossier complet sans agence attend une agence, le meme etat que le locataire', () => {
  const sans = etapesGarant('complet', 'fr', { agence: false })
  expect(sans.map((e) => `${e.titre}:${e.etat}`).join('|')).toContain(
    'En attente d’une agence:encours',
  )
  expect(sans.map((e) => e.titre)).not.toContain('Décision de l’agence')
  expect(garantAttendAgence('complet', { agence: false })).toBe(true)

  const avec = etapesGarant('complet', 'fr', { agence: true })
  expect(avec.map((e) => `${e.titre}:${e.etat}`).join('|')).toContain(
    'Décision de l’agence:encours',
  )
  expect(avec.map((e) => e.titre)).not.toContain('En attente d’une agence')
  expect(garantAttendAgence('complet', { agence: true })).toBe(false)
})

test('une demonstration sans agence passee compte comme un dossier suivi', () => {
  const demo = etapesGarant('complet', 'fr', { agence: false, demonstration: true })
  expect(demo.map((e) => e.titre)).toContain('Décision de l’agence')
  expect(demo.map((e) => e.titre)).not.toContain('En attente d’une agence')
  expect(garantAttendAgence('complet', { agence: false, demonstration: true })).toBe(false)
})

test('sans agence, l etape a venir ne s appelle pas encore une decision', () => {
  const titres = etapesGarant('depot_en_cours', 'fr', { agence: false }).map((e) => e.titre)
  expect(titres).toContain('En attente d’une agence')
  expect(titres).not.toContain('Décision de l’agence')
})

test('le texte du depot termine explique l attente, sans verdict', async () => {
  expect(resteAFaire.attenteAgence).toMatch(/rattacher ce dossier à une agence/)
  expect(resteAFaire.attenteAgence).not.toMatch(/examinera/)
  expect(resteAFaire.attenteAgence).not.toMatch(/éligible|insuffisant|ratio/)
  const attente = renderToStaticMarkup(await ResteAFaireGarant({ etapes: [], attendAgence: true }))
  expect(attente).toContain('rattacher ce dossier à une agence')
  expect(attente).not.toContain('L’agence examinera vos pièces')
  const suivi = renderToStaticMarkup(await ResteAFaireGarant({ etapes: [], attendAgence: false }))
  expect(suivi).toContain('L’agence examinera vos pièces')
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
