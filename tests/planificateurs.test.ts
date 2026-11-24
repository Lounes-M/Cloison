import { expect, test, vi } from 'vitest'
import {
  TACHES,
  evaluerTache,
  lireEtapesEnEchec,
  lirePassages,
  observerTache,
} from '@/lib/exploitation/planificateurs.mjs'
// @ts-expect-error Programme Node autonome.
import { verifierPlanificateurs } from '../scripts/verifier-planificateurs.mjs'

/**
 * La lecture des passages planifiés chez GitHub.
 *
 * Ce qui compte : une tâche qui ne tourne plus, qui échoue ou qui est
 * désactivée est nommée ; un passage manuel ne masque pas un planificateur
 * arrêté ; une réponse douteuse n'est jamais un vert ; le jeton ne part que
 * vers api.github.com.
 */

const MAINTENANT = Date.parse('2026-11-24T12:00:00Z')
const JETON = 'ghs_jetonfictifjetonfictifjeton'
const ilYA = (minutes: number) =>
  new Date(MAINTENANT - minutes * 60000).toISOString().replace('.000Z', 'Z')
const passage = (minutes: number, conclusion: string | null = 'success', event = 'schedule') => ({
  id: 1000 + Math.abs(minutes),
  status: conclusion === null ? 'in_progress' : 'completed',
  conclusion,
  event,
  created_at: ilYA(minutes),
  // GitHub rend bien d'autres champs : ils sont ignorés.
  repository: { full_name: 'exemple/depot', private: false },
})
const reponse = (...runs: unknown[]) => ({ total_count: runs.length, workflow_runs: runs })
const etat = (...runs: unknown[]) =>
  evaluerTache(lirePassages(reponse(...runs)), TACHES.maintenance, MAINTENANT).etat

test('des passages dans la journée dont un réussi : conforme, avec ses deux repères', () => {
  expect(
    evaluerTache(
      lirePassages(reponse(passage(5, 'failure'), passage(20), passage(35))),
      TACHES.maintenance,
      MAINTENANT,
    ),
  ).toEqual({
    etat: 'conforme',
    dernier_passage: '2026-11-24T11:55:00.000Z',
    derniere_reussite: '2026-11-24T11:40:00.000Z',
    passage_en_echec: null,
  })
  // Un échec isolé au milieu de réussites n'alerte pas.
  expect(etat(passage(5, 'failure'), passage(20))).toBe('conforme')
  // Un passage en cours prouve que le planificateur tourne.
  expect(etat(passage(1, null), passage(800))).toBe('conforme')
  // GitHub ne lance en pratique que toutes les cinq à quatorze heures.
  expect(etat(passage(14 * 60))).toBe('conforme')
})

test('aucun passage planifié depuis un jour : absente', () => {
  expect(etat()).toBe('absente')
  expect(etat(passage(1441), passage(2000))).toBe('absente')
  expect(etat(passage(1440))).toBe('conforme')
})

test('un passage manuel ou déclenché par la CI ne masque pas un planificateur arrêté', () => {
  expect(etat(passage(2, 'success', 'workflow_dispatch'), passage(2000))).toBe('absente')
  expect(etat(passage(2, 'success', 'workflow_run'), passage(2000))).toBe('absente')
})

test('un passage entièrement ignoré ne compte pas comme un passage', () => {
  expect(etat(passage(2, 'skipped'), passage(2000))).toBe('absente')
})

test('des passages mais aucune réussite depuis un jour : en échec, avec le passage à examiner', () => {
  expect(etat(passage(5, 'failure'), passage(20, 'failure'))).toBe('en_echec')
  expect(etat(passage(5, 'failure'), passage(1500))).toBe('en_echec')
  for (const conclusion of ['cancelled', 'timed_out', 'startup_failure', 'neutral'])
    expect(etat(passage(5, conclusion))).toBe('en_echec')
  expect(etat(passage(5, null))).toBe('en_echec')
  // Le passage nommé est le dernier en échec, pas un passage encore en cours.
  expect(
    evaluerTache(
      lirePassages(reponse(passage(1, null), passage(60, 'failure'), passage(700, 'failure'))),
      TACHES.supervision,
      MAINTENANT,
    ).passage_en_echec,
  ).toBe(1060)
})

test('les trois tâches tolèrent un jour : GitHub est le planificateur de secours', () => {
  for (const nom of ['maintenance', 'actes', 'supervision'] as const) {
    const selon = (minutes: number) =>
      evaluerTache(lirePassages(reponse(passage(minutes))), TACHES[nom], MAINTENANT).etat
    expect(selon(1440)).toBe('conforme')
    expect(selon(1441)).toBe('absente')
  }
})

test('une réponse douteuse est illisible, jamais un vert', () => {
  for (const valeur of [
    null,
    [],
    {},
    { workflow_runs: 'aucun' },
    reponse(null),
    reponse({ ...passage(5), created_at: 'hier' }),
    reponse({ ...passage(5), created_at: '2026-11-24 11:55:00' }),
    reponse({ ...passage(5), status: 1 }),
    reponse({ ...passage(5), conclusion: 1 }),
    reponse({ ...passage(5), event: undefined }),
    reponse({ ...passage(5), id: 'abc' }),
    reponse({ ...passage(5), id: 0 }),
    reponse(...Array.from({ length: 101 }, () => passage(5))),
  ])
    expect(() => lirePassages(valeur)).toThrow('Planificateur illisible')
  // Un passage daté du futur : horloge ou réponse douteuse.
  expect(() =>
    evaluerTache(lirePassages(reponse(passage(-10))), TACHES.maintenance, MAINTENANT),
  ).toThrow('Planificateur illisible')
  expect(() => evaluerTache([], { retardMinutes: 0 }, MAINTENANT)).toThrow()
  expect(() => evaluerTache([], TACHES.maintenance, NaN)).toThrow()
})

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } })

test('la lecture part vers api.github.com, sans redirection, avec le jeton en en-tête seulement', async () => {
  const appeler = vi.fn(async () => json(reponse(passage(5))))
  const bilan = await observerTache('maintenance', {
    jeton: JETON,
    maintenant: MAINTENANT,
    appeler: appeler as unknown as typeof fetch,
  })
  expect(bilan.etat).toBe('conforme')
  expect(appeler).toHaveBeenCalledOnce()
  const [adresse, options] = appeler.mock.calls[0] as unknown as [string, RequestInit]
  expect(adresse).toBe(
    'https://api.github.com/repos/Lounes-M/Cloison/actions/workflows/maintenance.yml/runs?event=schedule&per_page=10',
  )
  expect(adresse).not.toContain(JETON)
  expect(options.redirect).toBe('error')
  expect(options.signal).toBeInstanceOf(AbortSignal)
  expect((options.headers as Record<string, string>).Authorization).toBe(`Bearer ${JETON}`)
})

test('sans jeton, aucune autorisation n’est envoyée', async () => {
  const appeler = vi.fn(async () => json(reponse(passage(5))))
  await observerTache('supervision', {
    maintenant: MAINTENANT,
    appeler: appeler as unknown as typeof fetch,
  })
  const [, options] = appeler.mock.calls[0] as unknown as [string, RequestInit]
  expect(Object.keys(options.headers as object)).not.toContain('Authorization')
})

test('une tâche en anomalie est dite désactivée quand GitHub le déclare', async () => {
  for (const [state, attendu] of [
    ['active', 'absente'],
    ['disabled_inactivity', 'desactivee'],
    ['disabled_manually', 'desactivee'],
  ] as const) {
    const appeler = vi.fn(async (adresse: string) =>
      json(adresse.includes('/runs?') ? reponse(passage(3000)) : { state }),
    )
    const bilan = await observerTache('actes', {
      maintenant: MAINTENANT,
      appeler: appeler as unknown as typeof fetch,
    })
    expect(bilan.etat).toBe(attendu)
    expect(appeler.mock.calls[1]![0]).toBe(
      'https://api.github.com/repos/Lounes-M/Cloison/actions/workflows/actes.yml',
    )
  }
})

test('une erreur HTTP, un réseau coupé ou un corps invalide sont illisibles', async () => {
  const cas: (() => Promise<Response>)[] = [
    async () => json({ message: 'rate limit' }, 403),
    async () => json({}, 404),
    async () => {
      throw new Error('DETAIL_RESEAU')
    },
    async () => new Response('pas du json', { status: 200 }),
    async () => new Response(null, { status: 200 }),
    async () => json({ workflow_runs: [{}] }),
  ]
  for (const appeler of cas)
    await expect(
      observerTache('maintenance', {
        maintenant: MAINTENANT,
        appeler: appeler as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Planificateur illisible')
})

test('un dépôt, une tâche ou un jeton mal formés ne déclenchent aucun appel', async () => {
  const appeler = vi.fn()
  const options = { maintenant: MAINTENANT, appeler: appeler as unknown as typeof fetch }
  await expect(
    observerTache('maintenance', { ...options, depot: 'intrus.invalid/a/b' }),
  ).rejects.toThrow()
  await expect(observerTache('maintenance', { ...options, depot: '../../autre' })).rejects.toThrow()
  await expect(observerTache('constructor' as never, options)).rejects.toThrow()
  await expect(observerTache('maintenance', { ...options, jeton: 'a b\r\nX: y' })).rejects.toThrow()
  expect(appeler).not.toHaveBeenCalled()
})

test('la supervision vérifie la maintenance et les actes, et refuse sans contexte GitHub', async () => {
  const appeler = vi.fn(async (adresse: string) =>
    json(
      adresse.includes('/runs?')
        ? reponse(adresse.includes('actes.yml') ? passage(2000) : passage(5))
        : { state: 'active' },
    ),
  )
  const env = { GITHUB_REPOSITORY: 'Lounes-M/Cloison', GITHUB_TOKEN: JETON }
  const bilan = await verifierPlanificateurs(env, { maintenant: MAINTENANT, appeler })
  expect(bilan.conforme).toBe(false)
  expect(bilan.taches.maintenance.etat).toBe('conforme')
  expect(bilan.taches.actes.etat).toBe('absente')
  expect(Object.keys(bilan.taches)).toEqual(['maintenance', 'actes'])
  await expect(verifierPlanificateurs({ GITHUB_REPOSITORY: 'a/b' })).rejects.toThrow(
    'Contexte GitHub absent',
  )
  await expect(verifierPlanificateurs({ GITHUB_TOKEN: JETON })).rejects.toThrow(
    'Contexte GitHub absent',
  )
})

test('le script distingue vert, anomalie et lecture impossible', async () => {
  const tout = (minutes: number) =>
    vi.fn(async (adresse: string) =>
      json(adresse.includes('/runs?') ? reponse(passage(minutes)) : { state: 'active' }),
    )
  const env = { GITHUB_REPOSITORY: 'Lounes-M/Cloison', GITHUB_TOKEN: JETON }
  expect(
    (await verifierPlanificateurs(env, { maintenant: MAINTENANT, appeler: tout(5) })).conforme,
  ).toBe(true)
  expect(
    (await verifierPlanificateurs(env, { maintenant: MAINTENANT, appeler: tout(5000) })).conforme,
  ).toBe(false)
  await expect(
    verifierPlanificateurs(env, {
      maintenant: MAINTENANT,
      appeler: async () => json({}, 500),
    }),
  ).rejects.toThrow('Planificateur illisible')
})

const jobs = {
  jobs: [
    {
      name: 'parcours-publics',
      conclusion: 'success',
      steps: [{ name: 'Set up job', conclusion: 'success' }],
    },
    {
      name: 'rapport',
      conclusion: 'failure',
      steps: [
        { name: 'Compteurs agreges et anomalies a examiner', conclusion: 'success' },
        { name: 'Derive du schema de production', conclusion: 'failure' },
        { name: 'Post Run actions/setup-node', conclusion: 'skipped' },
      ],
    },
    {
      name: 'alerte',
      conclusion: 'failure',
      steps: [{ name: "Courriel d'alerte sans donnee de dossier", conclusion: 'failure' }],
    },
    { name: 'annule', conclusion: 'failure', steps: [] },
  ],
}

test('les étapes en échec sont nommées « job : étape », et rien d’autre', () => {
  expect(lireEtapesEnEchec(jobs)).toEqual([
    'rapport : Derive du schema de production',
    "alerte : Courriel d'alerte sans donnee de dossier",
    'annule',
  ])
  expect(() => lireEtapesEnEchec({})).toThrow('Planificateur illisible')
  expect(() => lireEtapesEnEchec({ jobs: [null] })).toThrow('Planificateur illisible')
})

test('un nom hors de la liste fermée de caractères n’entre pas dans un courriel', () => {
  const etapes = lireEtapesEnEchec({
    jobs: [
      {
        name: 'rapport',
        conclusion: 'failure',
        steps: [{ name: 'Lien https://intrus.invalid/?a=b', conclusion: 'failure' }],
      },
      { name: 'ligne\nforgee', conclusion: 'failure', steps: [] },
      { name: 'x'.repeat(81), conclusion: 'failure', steps: [] },
      {
        name: 'rapport',
        conclusion: 'failure',
        steps: [{ name: '<script>', conclusion: 'failure' }],
      },
    ],
  })
  expect(etapes).toEqual(['rapport', 'rapport'])
  // Douze lignes au plus.
  expect(
    lireEtapesEnEchec({
      jobs: Array.from({ length: 30 }, (_, i) => ({ name: `job ${i}`, conclusion: 'failure' })),
    }),
  ).toHaveLength(12)
})

test('une tâche en échec rend les étapes de son dernier passage en échec', async () => {
  const appeler = vi.fn(async (adresse: string) =>
    json(
      adresse.includes('/runs?')
        ? reponse(passage(60, 'failure'), passage(700, 'failure'))
        : adresse.includes('/jobs')
          ? jobs
          : { state: 'active' },
    ),
  )
  const bilan = await observerTache('supervision', {
    maintenant: MAINTENANT,
    appeler: appeler as unknown as typeof fetch,
  })
  expect(bilan).toEqual({
    etat: 'en_echec',
    dernier_passage: '2026-11-24T11:00:00.000Z',
    derniere_reussite: null,
    etapes_en_echec: [
      'rapport : Derive du schema de production',
      "alerte : Courriel d'alerte sans donnee de dossier",
      'annule',
    ],
  })
  expect(appeler.mock.calls[2]![0]).toBe(
    'https://api.github.com/repos/Lounes-M/Cloison/actions/runs/1060/jobs?per_page=30',
  )
})

test('le détail des étapes peut manquer : l’anomalie reste', async () => {
  const appeler = vi.fn(async (adresse: string) =>
    adresse.includes('/jobs')
      ? json({}, 403)
      : json(adresse.includes('/runs?') ? reponse(passage(60, 'failure')) : { state: 'active' }),
  )
  const bilan = await observerTache('supervision', {
    maintenant: MAINTENANT,
    appeler: appeler as unknown as typeof fetch,
  })
  expect(bilan.etat).toBe('en_echec')
  expect(bilan.etapes_en_echec).toEqual([])
})
