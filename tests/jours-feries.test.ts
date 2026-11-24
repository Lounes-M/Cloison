import { expect, test } from 'vitest'
import {
  ajouterJours,
  echeanceOuvree,
  estJourFerie,
  estJourOuvre,
  jourDeParis,
  joursFeries,
  joursFeriesDecomptes,
  nomJourFerie,
  paques,
  prochainJourOuvre,
} from '@/lib/exploitation/jours-feries.mjs'

/**
 * Le calendrier des jours fériés et le décompte en jours ouvrés.
 *
 * Ce qui compte : Pâques et les fêtes mobiles sont exactes, les onze jours
 * légaux sont là et rien d'autre, l'Alsace-Moselle ajoute ses deux jours, et
 * un délai en jours ouvrés saute le week-end et les jours fériés à l'heure de
 * Paris, y compris à travers un changement d'heure.
 */

test('Pâques tombe juste, des années ordinaires aux cas limites de l’algorithme', () => {
  const connues: Record<number, string> = {
    1954: '1954-04-18',
    1981: '1981-04-19',
    2000: '2000-04-23',
    2008: '2008-03-23',
    2011: '2011-04-24',
    2019: '2019-04-21',
    2024: '2024-03-31',
    2025: '2025-04-20',
    2026: '2026-04-05',
    2027: '2027-03-28',
    2028: '2028-04-16',
    2030: '2030-04-21',
    2038: '2038-04-25',
    2049: '2049-04-18',
    2076: '2076-04-19',
  }
  for (const [annee, jour] of Object.entries(connues)) expect(paques(Number(annee))).toBe(jour)
  // Toujours un dimanche, entre le 22 mars et le 25 avril.
  for (let annee = 1900; annee <= 2200; annee++) {
    const p = paques(annee)
    expect(new Date(`${p}T12:00:00Z`).getUTCDay()).toBe(0)
    expect(p.slice(5) >= '03-22' && p.slice(5) <= '04-25').toBe(true)
  }
})

test('les onze jours fériés légaux de 2026 et de 2027, dans l’ordre', () => {
  expect(joursFeries(2026).map((f) => f.jour)).toEqual([
    '2026-01-01',
    '2026-04-06',
    '2026-05-01',
    '2026-05-08',
    '2026-05-14',
    '2026-05-25',
    '2026-07-14',
    '2026-08-15',
    '2026-11-01',
    '2026-11-11',
    '2026-12-25',
  ])
  expect(joursFeries(2027).map((f) => `${f.jour} ${f.nom}`)).toEqual([
    '2027-01-01 Jour de l’An',
    '2027-03-29 Lundi de Pâques',
    '2027-05-01 Fête du Travail',
    '2027-05-06 Ascension',
    '2027-05-08 Victoire de 1945',
    '2027-05-17 Lundi de Pentecôte',
    '2027-07-14 Fête nationale',
    '2027-08-15 Assomption',
    '2027-11-01 Toussaint',
    '2027-11-11 Armistice de 1918',
    '2027-12-25 Noël',
  ])
})

test('ni le dimanche de Pâques, ni la Pentecôte, ni le Vendredi saint ne sont fériés en métropole', () => {
  expect(estJourFerie('2026-04-05')).toBe(false)
  expect(estJourFerie('2026-05-24')).toBe(false)
  expect(estJourFerie('2026-04-03')).toBe(false)
  expect(estJourFerie('2026-12-26')).toBe(false)
  expect(nomJourFerie('2026-05-14')).toBe('Ascension')
  expect(nomJourFerie('2026-05-15')).toBeNull()
})

test('l’Alsace-Moselle ajoute le Vendredi saint et la Saint-Étienne', () => {
  const locale = joursFeries(2026, 'alsace-moselle')
  expect(locale).toHaveLength(13)
  expect(nomJourFerie('2026-04-03', 'alsace-moselle')).toBe('Vendredi saint')
  expect(nomJourFerie('2026-12-26', 'alsace-moselle')).toBe('Saint-Étienne')
  expect(estJourOuvre('2026-04-03', 'alsace-moselle')).toBe(false)
  expect(estJourOuvre('2026-04-03')).toBe(true)
  // Les onze jours nationaux y restent fériés.
  for (const f of joursFeries(2026)) expect(estJourFerie(f.jour, 'alsace-moselle')).toBe(true)
})

test('deux fêtes le même jour ne font qu’un jour férié', () => {
  // En 2008, l'Ascension tombe le 1er mai.
  expect(nomJourFerie('2008-05-01')).toBe('Fête du Travail, Ascension')
  expect(joursFeriesDecomptes('2008-04-30T10:00:00Z', '2008-05-02T10:00:00Z')).toHaveLength(1)
  expect(prochainJourOuvre('2008-05-01')).toBe('2008-05-02')
})

test('un jour ouvré va du lundi au vendredi, hors jours fériés', () => {
  expect(estJourOuvre('2026-11-24')).toBe(true)
  expect(estJourOuvre('2026-11-28')).toBe(false)
  expect(estJourOuvre('2026-11-29')).toBe(false)
  expect(estJourOuvre('2026-11-11')).toBe(false)
  // Vendredi 25 décembre férié, puis le week-end.
  expect(prochainJourOuvre('2026-12-25')).toBe('2026-12-28')
  expect(prochainJourOuvre('2026-12-24')).toBe('2026-12-24')
  expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01')
})

test('le jour civil est celui de Paris, pas celui du serveur', () => {
  expect(jourDeParis('2026-12-24T23:30:00Z')).toBe('2026-12-25')
  expect(jourDeParis('2026-07-13T21:59:59Z')).toBe('2026-07-13')
  expect(jourDeParis('2026-07-13T22:00:00Z')).toBe('2026-07-14')
})

const iso = (d: Date) => d.toISOString()

test('sans jour férié, le délai suit la règle de la base : même heure, week-end sauté', () => {
  // Lundi 23 novembre 2026, 10 h à Paris.
  expect(iso(echeanceOuvree('2026-11-23T09:00:00Z', 1))).toBe('2026-11-24T09:00:00.000Z')
  expect(iso(echeanceOuvree('2026-11-23T09:00:00Z', 2))).toBe('2026-11-25T09:00:00.000Z')
  // Jeudi : le délai enjambe le week-end.
  expect(iso(echeanceOuvree('2026-11-26T09:00:00Z', 2))).toBe('2026-11-30T09:00:00.000Z')
  // Samedi : départ du lundi à minuit, heure de Paris.
  expect(iso(echeanceOuvree('2026-11-28T15:00:00Z', 2))).toBe('2026-12-01T23:00:00.000Z')
  expect(iso(echeanceOuvree('2026-11-28T15:00:00Z', 0))).toBe('2026-11-29T23:00:00.000Z')
})

test('un jour férié en semaine repousse le délai d’un jour ouvré', () => {
  // Reçue le mardi 10 novembre 2026 à 10 h : le mercredi 11 ne compte pas.
  expect(iso(echeanceOuvree('2026-11-10T09:00:00Z', 1))).toBe('2026-11-12T09:00:00.000Z')
  expect(iso(echeanceOuvree('2026-11-10T09:00:00Z', 2))).toBe('2026-11-13T09:00:00.000Z')
  // Reçue le jeudi 24 décembre : vendredi férié, week-end, puis lundi et mardi.
  expect(iso(echeanceOuvree('2026-12-24T09:00:00Z', 2))).toBe('2026-12-29T09:00:00.000Z')
  // Reçue le jour férié lui-même : départ du premier jour ouvré, à minuit.
  expect(iso(echeanceOuvree('2026-12-25T14:00:00Z', 2))).toBe('2026-12-29T23:00:00.000Z')
  // Mercredi 13 mai 2026 : Ascension le jeudi, vendredi ouvré, puis lundi.
  expect(iso(echeanceOuvree('2026-05-13T08:00:00Z', 2))).toBe('2026-05-18T08:00:00.000Z')
  // Jeudi 2 avril 2026 : le lundi de Pâques ne compte pas.
  expect(iso(echeanceOuvree('2026-04-02T08:00:00Z', 2))).toBe('2026-04-07T08:00:00.000Z')
  // En Alsace-Moselle, le Vendredi saint non plus.
  expect(iso(echeanceOuvree('2026-04-02T08:00:00Z', 2, 'alsace-moselle'))).toBe(
    '2026-04-08T08:00:00.000Z',
  )
})

test('un férié le week-end ne retire aucun jour ouvré', () => {
  // Le 15 août 2026 est un samedi, le 1er novembre un dimanche.
  expect(iso(echeanceOuvree('2026-08-13T08:00:00Z', 2))).toBe('2026-08-17T08:00:00.000Z')
  expect(iso(echeanceOuvree('2026-10-29T09:00:00Z', 2))).toBe('2026-11-02T09:00:00.000Z')
  expect(joursFeriesDecomptes('2026-08-13T08:00:00Z', '2026-08-17T08:00:00Z')).toEqual([])
})

test('l’heure murale tient à travers un changement d’heure', () => {
  // Vendredi 27 mars 2026, 10 h à Paris (UTC+1) ; lundi 30, 10 h (UTC+2).
  expect(iso(echeanceOuvree('2026-03-27T09:00:00Z', 1))).toBe('2026-03-30T08:00:00.000Z')
  // Vendredi 23 octobre 2026, 10 h (UTC+2) ; lundi 26, 10 h (UTC+1).
  expect(iso(echeanceOuvree('2026-10-23T08:00:00Z', 1))).toBe('2026-10-26T09:00:00.000Z')
  // Les millisecondes sont conservees.
  expect(iso(echeanceOuvree('2026-11-23T09:00:00.123Z', 1))).toBe('2026-11-24T09:00:00.123Z')
})

test('le délai ne tombe jamais un jour non ouvré et n’est jamais plus court que celui de la base', () => {
  const HEURE = 3600000
  for (let i = 0; i < 366 * 24; i += 7) {
    const depuis = new Date(Date.UTC(2026, 0, 1) + i * HEURE)
    for (const jours of [1, 2]) {
      const fin = echeanceOuvree(depuis, jours)
      expect(estJourOuvre(jourDeParis(fin))).toBe(true)
      expect(fin.getTime() - depuis.getTime()).toBeGreaterThan(0)
      // Au moins `jours` jours pleins se sont écoulés, à une heure d'été près.
      expect(fin.getTime() - depuis.getTime()).toBeGreaterThanOrEqual(jours * 23 * HEURE - 86400000)
    }
    expect(echeanceOuvree(depuis, 2).getTime()).toBeGreaterThan(echeanceOuvree(depuis, 1).getTime())
  }
})

test('les jours fériés décomptés sont ceux de la semaine, bornes comprises', () => {
  expect(joursFeriesDecomptes('2026-12-24T09:00:00Z', '2026-12-29T09:00:00Z')).toEqual([
    { jour: '2026-12-25', nom: 'Noël' },
  ])
  expect(joursFeriesDecomptes('2026-11-23T09:00:00Z', '2026-11-25T09:00:00Z')).toEqual([])
  expect(joursFeriesDecomptes('2026-05-01T09:00:00Z', '2026-05-08T09:00:00Z')).toHaveLength(2)
})

test('une entrée invalide est refusée plutôt que devinée', () => {
  for (const jour of ['2026-02-30', '26-01-01', '', '2026-1-1'])
    expect(() => estJourOuvre(jour)).toThrow('Calendrier invalide')
  expect(() => joursFeries(2026, 'corse' as never)).toThrow('Calendrier invalide')
  expect(() => joursFeries(1200)).toThrow('Calendrier invalide')
  expect(() => echeanceOuvree('hier', 2)).toThrow('Calendrier invalide')
  expect(() => echeanceOuvree('2026-11-23T09:00:00Z', -1)).toThrow('Calendrier invalide')
  expect(() => echeanceOuvree('2026-11-23T09:00:00Z', 1.5)).toThrow('Calendrier invalide')
  expect(() => echeanceOuvree('2026-11-23T09:00:00Z', 2, 'corse' as never)).toThrow(
    'Calendrier invalide',
  )
})
