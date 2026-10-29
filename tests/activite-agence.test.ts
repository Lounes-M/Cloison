import { expect, test } from 'vitest'
import { libelleMois, totauxActivite, type MoisActivite } from '@/lib/agences/activite'

const mois = (v: Partial<MoisActivite>): MoisActivite => ({
  mois: '2026-10-01',
  ouverts: 0,
  pris: 0,
  refuses: 0,
  signes: 0,
  clos: 0,
  delai_prise_moyen_jours: null,
  ...v,
})

test('sans decision, ni taux ni delai', () => {
  expect(totauxActivite([mois({ ouverts: 4 })])).toEqual({
    ouverts: 4,
    acceptation: null,
    delaiJours: null,
  })
})

test('le taux rapporte les prises aux decisions, le delai est pondere par les prises', () => {
  expect(
    totauxActivite([
      mois({ ouverts: 5, pris: 3, refuses: 1, delai_prise_moyen_jours: '2.0' }),
      mois({ ouverts: 2, pris: 1, delai_prise_moyen_jours: 6 }),
    ]),
  ).toEqual({ ouverts: 7, acceptation: 80, delaiJours: 3 })
})

test('le mois se lit en toutes lettres', () => {
  expect(libelleMois('2026-10-01')).toBe('octobre 2026')
  expect(libelleMois('n importe quoi')).toBe('n importe quoi')
})
