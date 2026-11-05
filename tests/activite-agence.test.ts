import { expect, test, vi } from 'vitest'
import { activiteCSV, libelleMois, totauxActivite, type MoisActivite } from '@/lib/agences/activite'
import { GET } from '@/app/(agence)/espace/activite/export/route'

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

test('le CSV reprend les compteurs mois par mois, sans rien d autre', () => {
  const csv = activiteCSV([
    mois({ ouverts: 5, pris: 3, refuses: 1, signes: 2, clos: 1, delai_prise_moyen_jours: '2.345' }),
    mois({ mois: '2026-09-01', ouverts: 1 }),
  ])
  const lignes = csv.split('\r\n')
  expect(lignes[0]).toBe(
    '﻿"Mois";"Reçus";"Pris";"Refusés";"Signés";"Clos";"Délai moyen jusqu’à la prise (jours)"',
  )
  expect(lignes[1]).toBe('"2026-10";"5";"3";"1";"2";"1";"2,3"')
  expect(lignes[2]).toBe('"2026-09";"1";"0";"0";"0";"0";""')
  expect(lignes[3]).toBe('')
})

test.each([
  [[mois({ ouverts: -1 })]],
  [[mois({ mois: '=1+1' })]],
  [[mois({ delai_prise_moyen_jours: '=2' })]],
  [[{ ...mois({}), pris: '3' }]],
  [null],
])('le CSV refuse des compteurs invalides', (donnees) => {
  expect(() => activiteCSV(donnees)).toThrow()
})

const contexte = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: contexte }))

test('la route rend le CSV a tout membre rattache, en prive', async () => {
  const rpc = vi.fn(async () => ({ data: [mois({ ouverts: 2 })], error: null }))
  contexte.mockResolvedValue({ etat: 'rattache', supabase: { rpc } })
  const reponse = await GET()
  expect(rpc).toHaveBeenCalledWith('activite_de_mon_agence')
  expect(reponse.status).toBe(200)
  expect(reponse.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(reponse.headers.get('cache-control')).toBe('private, no-store')
  expect(reponse.headers.get('content-disposition')).toContain('cloison-activite.csv')
  expect(await reponse.text()).toContain('"2026-10";"2";')
})

test('sans rattachement ou en panne, aucun fichier', async () => {
  contexte.mockResolvedValue({ etat: 'anonyme' })
  expect((await GET()).status).toBe(403)
  contexte.mockResolvedValue({
    etat: 'rattache',
    supabase: { rpc: async () => ({ data: null, error: { message: 'prive' } }) },
  })
  const panne = await GET()
  expect(panne.status).toBe(503)
  expect(await panne.text()).not.toContain('prive')
})
