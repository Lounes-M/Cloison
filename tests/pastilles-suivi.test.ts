import { expect, test } from 'vitest'
import { limiteSansNouvelles, pastillesDuDossier } from '@/lib/agences/inactivite'

const maintenant = Date.parse('2026-10-30T12:00:00Z')
const limite = limiteSansNouvelles(maintenant)
const ilYa = (jours: number) => new Date(maintenant - jours * 86400000).toISOString()

test('un remplacement fourni se signale, quel que soit le statut', () => {
  expect(
    pastillesDuDossier(
      { statut: 'complet', activite_rappel_le: ilYa(30), suivi: [{ etat: 'fourni' }] },
      limite,
    ),
  ).toEqual(['remplacement'])
  expect(
    pastillesDuDossier(
      { statut: 'complet', suivi: [{ etat: 'demande' }, { etat: 'valide' }] },
      limite,
    ),
  ).toEqual([])
})

test('sans nouvelles : en attente d un porteur et au-dela de sept jours seulement', () => {
  expect(pastillesDuDossier({ statut: 'ouvert', activite_rappel_le: ilYa(8) }, limite)).toEqual([
    'sans_nouvelles',
  ])
  expect(
    pastillesDuDossier({ statut: 'depot_en_cours', activite_rappel_le: ilYa(6) }, limite),
  ).toEqual([])
  expect(pastillesDuDossier({ statut: 'transmis', activite_rappel_le: ilYa(30) }, limite)).toEqual(
    [],
  )
  expect(pastillesDuDossier({ statut: 'ouvert', activite_rappel_le: null }, limite)).toEqual([])
})
