import { beforeEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ETAPES, MOTIFS, PARTIES } from '@/lib/agences/tableau-de-bord'

const contexte = vi.hoisted(() => vi.fn())
const redirection = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: contexte }))
vi.mock('next/navigation', () => ({ redirect: redirection }))

import PagePilotage from '@/app/(agence)/espace/pilotage/page'

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const zero = <C extends string>(cles: readonly C[]) =>
  Object.fromEntries(cles.map((c) => [c, 0])) as Record<C, number>
const synthese = {
  genere_le: '2026-11-24T14:00:00+00:00',
  etapes: { ...zero(ETAPES), ouvert: 4, depot_en_cours: 7, complet: 2, transmis: 3, signe: 5 },
  en_cours: 16,
  echeances_proches: 2,
  bloques: 3,
  blocages: {
    ...zero(MOTIFS),
    decision_attendue: 1,
    garant_non_designe: 1,
    relances_epuisees: 1,
  },
  attendus: { ...zero(PARTIES), agence: 1, locataire: 1, garant: 1 },
  seuils: { agence: 2, locataire: 3, garant: 7, signataires: 7 },
}
const jours = (n: number) => new Date(Date.now() - n * 86400000 - 3600000).toISOString()
const bloques = [
  {
    id: id(1),
    reference: 'REFGARANT001',
    statut: 'depot_en_cours',
    motif: 'relances_epuisees',
    attend: 'garant',
    depuis: jours(12),
    echeance_proche: true,
  },
  {
    id: id(2),
    reference: 'REFAGENCE002',
    statut: 'complet',
    motif: 'decision_attendue',
    attend: 'agence',
    depuis: jours(1),
    echeance_proche: false,
  },
]
const mois = Array.from({ length: 12 }, (_, i) => ({
  mois: new Date(Date.UTC(2026, 10 - i, 1)).toISOString().slice(0, 10),
  ouverts: i === 0 ? 9 : 0,
  complets: i === 0 ? 4 : 0,
  delai_complet_moyen_jours: i === 0 ? '5.5' : null,
  signes: i === 0 ? 2 : 0,
  signatures_mesurees: i === 0 ? 2 : 0,
  delai_signature_moyen_jours: i === 0 ? 11 : null,
  relances_garant: i === 0 ? 6 : 1,
  relances_locataire: i === 0 ? 2 : 0,
}))

const reponses: Record<string, unknown> = {}
const rpc = vi.fn((fonction: string) => Promise.resolve(reponses[fonction]))
beforeEach(() => {
  vi.clearAllMocks()
  reponses.pilotage_de_mon_agence = { data: synthese, error: null }
  reponses.dossiers_bloques_de_mon_agence = { data: bloques, error: null }
  reponses.pilotage_mensuel_de_mon_agence = { data: mois, error: null }
  contexte.mockResolvedValue({ etat: 'rattache', role: 'membre', supabase: { rpc } })
})
const rendre = async () => renderToStaticMarkup(await PagePilotage())

test('la page montre les etapes, les delais, les blocages et les relances', async () => {
  const html = await rendre()
  // Aucun argument : la base lit l'agence de la session.
  expect(rpc.mock.calls.map((a) => a).sort()).toEqual(
    [
      ['dossiers_bloques_de_mon_agence'],
      ['pilotage_de_mon_agence'],
      ['pilotage_mensuel_de_mon_agence'],
    ].sort(),
  )
  expect(html).toContain('Dossiers par étape')
  expect(html).toContain('href="/espace?statut=depot_en_cours"')
  expect(html).toContain('5,5 j')
  expect(html).toContain('11 j')
  expect(html).toContain('dont 1 en attente de votre agence')
  expect(html).toContain(`href="/espace/dossiers/${id(1)}"`)
  expect(html).toContain('REFGARANT001')
  expect(html).toContain('12 jours')
  expect(html).toContain('1 jour<')
  expect(html).toContain('Coffre à échéance sous 7 jours')
  expect(html).toContain('1 dossier a épuisé ses relances')
  for (const vue of ['synthese', 'blocages', 'mois'])
    expect(html).toContain(`href="/espace/pilotage/export/${vue}"`)
  // Le reglage des relances est reserve a l'administrateur.
  expect(html).not.toContain('href="/espace/rappels"')
  expect(html).not.toContain('Indisponible')
})

test('l administrateur voit le lien vers le reglage des relances', async () => {
  contexte.mockResolvedValue({ etat: 'rattache', role: 'admin', supabase: { rpc } })
  expect(await rendre()).toContain('href="/espace/rappels"')
})

test('une panne s affiche indisponible, jamais comme un zero', async () => {
  reponses.pilotage_de_mon_agence = { data: null, error: { message: 'x' } }
  reponses.pilotage_mensuel_de_mon_agence = { data: [{ mois: 'x' }], error: null }
  const html = await rendre()
  expect(html.match(/Indisponible/g)).toHaveLength(4)
  expect(html.match(/n’a pas pu être chargée/g)?.length).toBeGreaterThanOrEqual(3)
  expect(html).not.toContain('Aucun dossier bloqué')
  // La liste, lue a part, reste affichee.
  expect(html).toContain('REFAGENCE002')
})

test('une lecture qui leve ne fait pas tomber la page', async () => {
  rpc.mockRejectedValueOnce(new Error('reseau'))
  expect(await rendre()).toContain('Pilotage')
})

test('sans blocage ni mesure, la page le dit', async () => {
  reponses.pilotage_de_mon_agence = {
    data: {
      ...synthese,
      bloques: 0,
      blocages: zero(MOTIFS),
      attendus: zero(PARTIES),
      echeances_proches: 0,
    },
    error: null,
  }
  reponses.dossiers_bloques_de_mon_agence = { data: [], error: null }
  reponses.pilotage_mensuel_de_mon_agence = {
    data: mois.map((m) => ({
      ...m,
      complets: 0,
      delai_complet_moyen_jours: null,
      signatures_mesurees: 0,
      delai_signature_moyen_jours: null,
    })),
    error: null,
  }
  const html = await rendre()
  expect(html).toContain('Aucun dossier bloqué. Tout avance.')
  expect(html.match(/Pas encore mesuré/g)).toHaveLength(2)
})

test('un visiteur non rattache est renvoye a la connexion sans rien lire', async () => {
  contexte.mockResolvedValue({ etat: 'anonyme' })
  redirection.mockImplementation(() => {
    throw new Error('redirection')
  })
  await expect(PagePilotage()).rejects.toThrow('redirection')
  expect(redirection).toHaveBeenCalledWith('/connexion')
  expect(rpc).not.toHaveBeenCalled()
})
