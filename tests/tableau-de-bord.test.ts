import { beforeEach, expect, test, vi } from 'vitest'
import {
  ETAPES,
  MOTIFS,
  PARTIES,
  bloquesCSV,
  joursDepuis,
  lireBloques,
  lireMois,
  lireSynthese,
  moisCSV,
  syntheseCSV,
  totauxPilotage,
} from '@/lib/agences/tableau-de-bord'
import { tableauDeBord as tEn } from '@/lib/content/en/tableau-de-bord'
import { tableauDeBord as tFr } from '@/lib/content/tableau-de-bord'
import { GET } from '@/app/(agence)/espace/pilotage/export/[vue]/route'

const contexte = vi.hoisted(() => vi.fn())
const langue = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: contexte }))
vi.mock('@/lib/langue-espace', () => ({ langueEspace: langue }))

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const zero = <C extends string>(cles: readonly C[]) =>
  Object.fromEntries(cles.map((c) => [c, 0])) as Record<C, number>
const synthese = (v: Record<string, unknown> = {}) => ({
  genere_le: '2026-11-24T14:00:00.123456+00:00',
  etapes: { ...zero(ETAPES), ouvert: 4, complet: 2, signe: 1 },
  en_cours: 6,
  echeances_proches: 1,
  bloques: 3,
  blocages: { ...zero(MOTIFS), decision_attendue: 2, garant_non_designe: 1 },
  attendus: { ...zero(PARTIES), agence: 2, locataire: 1 },
  seuils: { agence: 2, locataire: 3, garant: 7, signataires: 7 },
  ...v,
})
const bloque = (v: Record<string, unknown> = {}) => ({
  id: id(1),
  reference: 'AbCd1234EfGh',
  statut: 'complet',
  motif: 'decision_attendue',
  attend: 'agence',
  depuis: '2026-11-20T10:00:00+00:00',
  echeance_proche: true,
  ...v,
})
const mois = (v: Record<string, unknown> = {}) => ({
  mois: '2026-11-01',
  ouverts: 0,
  complets: 0,
  delai_complet_moyen_jours: null,
  signes: 0,
  signatures_mesurees: 0,
  delai_signature_moyen_jours: null,
  relances_garant: 0,
  relances_locataire: 0,
  ...v,
})
const maintenant = new Date('2026-11-24T14:00:00Z')

test('une synthese conforme se lit, ses dates sont normalisees', () => {
  expect(lireSynthese(synthese())).toMatchObject({
    genere_le: '2026-11-24T14:00:00.123Z',
    en_cours: 6,
    bloques: 3,
  })
})

test.each([
  ['absente', null],
  ['une etape manquante', synthese({ etapes: { ouvert: 1 } })],
  ['un compteur negatif', synthese({ en_cours: -1 })],
  ['un compteur en texte', synthese({ bloques: '3' })],
  ['des motifs qui ne s additionnent pas', synthese({ bloques: 4 })],
  [
    'des parties qui ne s additionnent pas',
    synthese({ attendus: { ...zero(PARTIES), agence: 1, locataire: 1 } }),
  ],
])('une synthese inattendue vaut une panne : %s', (_, donnees) => {
  expect(lireSynthese(donnees)).toBeNull()
})

test('la liste ecarte toute colonne en trop et refuse un motif inconnu', () => {
  const lus = lireBloques([bloque({ email_locataire: 'camille@example.invalid', ratio: 3.2 })])
  expect(lus).toHaveLength(1)
  expect(Object.keys(lus![0]!).sort()).toEqual([
    'attend',
    'depuis',
    'echeance_proche',
    'id',
    'motif',
    'reference',
    'statut',
  ])
  expect(lireBloques([bloque({ motif: 'autre' })])).toBeNull()
  expect(lireBloques([bloque({ statut: 'expire' })])).toBeNull()
  expect(lireBloques(Array.from({ length: 501 }, (_, i) => bloque({ id: id(i) })))).toBeNull()
  expect(lireBloques({})).toBeNull()
})

test('les moyennes sont ponderees par les dossiers mesures', () => {
  const lignes = lireMois([
    mois({
      complets: 3,
      delai_complet_moyen_jours: '2.0',
      signes: 5,
      signatures_mesurees: 1,
      delai_signature_moyen_jours: 10,
      relances_garant: 4,
      relances_locataire: 1,
    }),
    mois({
      mois: '2026-10-01',
      complets: 1,
      delai_complet_moyen_jours: 6,
      signes: 2,
      signatures_mesurees: 0,
      relances_garant: 2,
    }),
  ])!
  expect(totauxPilotage(lignes)).toEqual({
    delaiCompletJours: 3,
    delaiSignatureJours: 10,
    relancesGarant: 6,
    relancesLocataire: 1,
  })
  expect(totauxPilotage(lireMois([mois()])!)).toMatchObject({
    delaiCompletJours: null,
    delaiSignatureJours: null,
  })
  expect(lireMois([mois({ complets: 1.5 })])).toBeNull()
})

test('les jours sans activite sont entiers et jamais negatifs', () => {
  expect(joursDepuis('2026-11-20T10:00:00Z', maintenant)).toBe(4)
  expect(joursDepuis('2026-11-24T13:59:00Z', maintenant)).toBe(0)
  expect(joursDepuis('2026-11-25T10:00:00Z', maintenant)).toBe(0)
})

test('le CSV de synthese donne une ligne par indicateur', () => {
  const csv = syntheseCSV(
    lireSynthese(synthese())!,
    lireMois([mois({ complets: 2, delai_complet_moyen_jours: '4.25', relances_garant: 7 })])!,
  )
  const lignes = csv.split('\r\n')
  expect(lignes[0]).toBe('﻿"Rubrique";"Indicateur";"Valeur"')
  expect(lignes).toHaveLength(1 + 4 + ETAPES.length + MOTIFS.length + PARTIES.length + 4 + 1)
  expect(lignes).toContain('"Situation";"Dossiers en cours";"6"')
  expect(lignes).toContain('"Dossiers par étape";"Ouvert";"4"')
  expect(lignes).toContain('"Blocages par motif";"Décision à rendre : prendre ou refuser";"2"')
  expect(lignes).toContain('"Blocages par partie attendue";"Le locataire";"1"')
  expect(lignes).toContain(
    '"Délais sur douze mois";"Délai moyen jusqu’au dossier complet (jours)";"4,3"',
  )
  expect(lignes).toContain('"Délais sur douze mois";"Délai moyen jusqu’à la signature (jours)";""')
  expect(lignes).toContain('"Relances sur douze mois";"Au garant";"7"')
})

test('le CSV des blocages porte la reference, pas la personne, et neutralise les formules', () => {
  const csv = bloquesCSV(
    lireBloques([bloque(), bloque({ id: id(2), reference: '=cmd|1', echeance_proche: false })])!,
    'fr',
    maintenant,
  )
  const lignes = csv.split('\r\n')
  expect(lignes[0]).toBe(
    '﻿"Référence";"Étape";"Motif";"En attente de";"Dernière activité (UTC)";"Jours sans activité";"Coffre à échéance sous 7 jours";"Exporté le (UTC)"',
  )
  expect(lignes[1]).toBe(
    '"AbCd1234EfGh";"Complet";"Décision à rendre : prendre ou refuser";"Votre agence";"2026-11-20T10:00:00.000Z";"4";"Oui";"2026-11-24T14:00:00.000Z"',
  )
  expect(lignes[2]).toMatch(/^"Texte : =cmd\|1";.*;"Non";/)
  expect(csv).not.toContain(id(1))
})

test('le CSV mensuel et sa version anglaise', () => {
  const lignes = lireMois([
    mois({
      ouverts: 5,
      complets: 3,
      delai_complet_moyen_jours: 2.5,
      signes: 1,
      signatures_mesurees: 1,
      delai_signature_moyen_jours: '12.0',
      relances_garant: 4,
      relances_locataire: 2,
    }),
  ])!
  expect(moisCSV(lignes).split('\r\n')[1]).toBe('"2026-11";"5";"3";"2,5";"1";"12";"4";"2"')
  expect(moisCSV(lignes, 'en').split('\r\n')[0]).toContain('"Guarantor reminders"')
})

test('chaque motif, etape et partie a son libelle dans les deux langues', () => {
  for (const t of [tFr, tEn]) {
    expect(Object.keys(t.blocages.motifs).sort()).toEqual([...MOTIFS].sort())
    expect(Object.keys(t.blocages.parties).sort()).toEqual([...PARTIES].sort())
  }
})

// La route -------------------------------------------------------------------

const rpc = vi.fn()
const reponses: Record<string, unknown> = {}
const appeler = (vue: string) =>
  GET(new Request(`https://cloison.test/espace/pilotage/export/${vue}`), {
    params: Promise.resolve({ vue }),
  })
beforeEach(() => {
  vi.resetAllMocks()
  langue.mockResolvedValue('fr')
  reponses.pilotage_de_mon_agence = { data: synthese(), error: null }
  reponses.dossiers_bloques_de_mon_agence = { data: [bloque()], error: null }
  reponses.pilotage_mensuel_de_mon_agence = { data: [mois({ ouverts: 2 })], error: null }
  rpc.mockImplementation((fonction: string) => ({
    abortSignal: () => Promise.resolve(reponses[fonction]),
  }))
  contexte.mockResolvedValue({ etat: 'rattache', agence: { id: id(90) }, supabase: { rpc } })
})

test.each([
  ['synthese', ['pilotage_mensuel_de_mon_agence', 'pilotage_de_mon_agence'], '"Rubrique"'],
  ['blocages', ['dossiers_bloques_de_mon_agence'], '"AbCd1234EfGh"'],
  ['mois', ['pilotage_mensuel_de_mon_agence'], '"2026-11";"2"'],
])('la vue %s rend un CSV prive, sans argument venu de la requete', async (vue, lus, extrait) => {
  const r = await appeler(vue)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(r.headers.get('cache-control')).toBe('private, no-store')
  expect(r.headers.get('content-disposition')).toBe(
    `attachment; filename="cloison-pilotage-${vue}.csv"`,
  )
  expect(await r.text()).toContain(extrait)
  // Aucun identifiant d'agence ne part : la base lit celle de la session.
  expect(rpc.mock.calls).toEqual(lus.map((f) => [f]))
})

test('une vue inconnue ne lit rien', async () => {
  expect((await appeler('dossiers')).status).toBe(404)
  expect(contexte).not.toHaveBeenCalled()
})

test.each([{ etat: 'anonyme' }, { etat: 'non-rattache' }])(
  'sans rattachement, aucun export : $etat',
  async (c) => {
    contexte.mockResolvedValue(c)
    const r = await appeler('blocages')
    expect(r.status).toBe(403)
    expect(await r.text()).toBe('Export indisponible.')
    expect(rpc).not.toHaveBeenCalled()
  },
)

test.each([
  ['une erreur de lecture', { data: null, error: { message: 'x' } }],
  ['une reponse inattendue', { data: [{ id: 'pas-un-uuid' }], error: null }],
  ['une reponse vide', { data: null, error: null }],
])('aucun fichier partiel apres %s', async (_, reponse) => {
  reponses.dossiers_bloques_de_mon_agence = reponse
  reponses.pilotage_de_mon_agence = reponse
  for (const vue of ['blocages', 'synthese']) {
    const r = await appeler(vue)
    expect(r.status).toBe(503)
    expect(r.headers.get('content-type')).not.toContain('csv')
  }
})

test('une panne de session rend 503 sans detail', async () => {
  contexte.mockRejectedValue(new Error('secret interne'))
  const r = await appeler('mois')
  expect(r.status).toBe(503)
  expect(await r.text()).toBe('Export indisponible.')
})
