import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const d = vi.hoisted(() => ({
  envoyer: vi.fn(),
  rpc: vi.fn(),
  client: vi.fn(),
  observer: vi.fn(),
}))
vi.mock('@/lib/courriels/envoi', () => ({ envoyer: d.envoyer }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: d.client }))
vi.mock('@/lib/env', () => ({ env: { emailDestinataire: 'exploitant@example.invalid' } }))
vi.mock('@/lib/exploitation/planificateurs.mjs', () => ({
  TACHES: { supervision: { libelle: 'Supervision' } },
  observerTache: d.observer,
}))
import {
  veillerPlanificateurs as veiller,
  type Declencheur,
} from '@/lib/exploitation/veille-planificateurs'
const veillerPlanificateurs = (maintenant: Date, declencheur: Declencheur = 'supabase') =>
  veiller(declencheur, maintenant)

/**
 * La veille des tâches planifiées depuis l'application.
 *
 * Ce qui compte : une maintenance restée sans réussite, un traitement d'acte
 * arrêté ou en échec et une supervision GitHub arrêtée, en échec ou désactivée
 * préviennent l'exploitant une fois par panne et par jour ; une lecture GitHub impossible n'est ni un vert ni une
 * alerte ; aucun courriel ne porte autre chose que des dates.
 */

// 12 h 05 UTC : dans le premier quart d'heure, donc la supervision est lue.
const MIDI = new Date('2026-11-24T12:05:00Z')
const ilYA = (minutes: number, de = MIDI) => new Date(de.getTime() - minutes * 60000).toISOString()
let reussite: string | null
type Traitement = { confirme_le: string | null; reussi: boolean }
let actes: Record<string, Traitement> | null
const conforme = {
  etat: 'conforme',
  dernier_passage: ilYA(40),
  derniere_reussite: ilYA(40),
  etapes_en_echec: [],
}
const frais = (): Record<string, Traitement> => ({
  signature: { confirme_le: ilYA(3), reussi: true },
  archives: { confirme_le: ilYA(3), reussi: true },
  reglements: { confirme_le: ilYA(3), reussi: true },
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  reussite = ilYA(10)
  actes = frais()
  d.rpc.mockImplementation(async (nom: string) => ({
    data:
      nom === 'etat_maintenance'
        ? { derniere_reussite: reussite }
        : { version: 1, traitements: actes, reprises_a_examiner: 0 },
    error: null,
  }))
  d.client.mockResolvedValue({ rpc: d.rpc })
  d.envoyer.mockResolvedValue(true)
  d.observer.mockResolvedValue(conforme)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test('tout va bien : aucun courriel, aucun échec', async () => {
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.rpc).toHaveBeenCalledWith('etat_maintenance')
  expect(d.rpc).toHaveBeenCalledWith('etat_traitements_actes')
  expect(d.observer).toHaveBeenCalledWith(
    'supervision',
    expect.objectContaining({ maintenant: MIDI.getTime(), signal: expect.any(AbortSignal) }),
  )
  expect(d.envoyer).not.toHaveBeenCalled()
})

test('une maintenance sans réussite depuis plus de 45 minutes prévient l’exploitant', async () => {
  reussite = ilYA(45)
  await veillerPlanificateurs(MIDI)
  expect(d.envoyer).not.toHaveBeenCalled()
  reussite = ilYA(190)
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.envoyer).toHaveBeenCalledOnce()
  const [a, sujet, texte, cle, repondre, differe, contexte] = d.envoyer.mock.calls[0]!
  expect(a).toBe('exploitant@example.invalid')
  expect(sujet).toBe('[Cloison] Maintenance sans réussite depuis 3 h 10')
  expect(texte).toContain('mardi 24 novembre 2026 à 09:55')
  expect(texte).toContain('cloison-maintenance-http')
  expect(texte).toContain('lancé par Supabase (pg_cron)')
  expect(texte).toContain('Ce courriel ne contient aucune donnée de dossier.')
  // Interne, en texte seul, différé, dans la file de ce passage.
  expect(typeof texte).toBe('string')
  expect(cle).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
  expect(repondre).toBeUndefined()
  expect(differe).toBe(true)
  expect(contexte.db).toEqual({ rpc: d.rpc })
})

test('une même panne garde sa clé, puis en change chaque jour et à chaque nouvelle panne', async () => {
  reussite = '2026-11-24T08:00:00.000Z'
  const cle = async (maintenant: string) => {
    d.envoyer.mockClear()
    await veillerPlanificateurs(new Date(maintenant))
    return d.envoyer.mock.calls[0]![3] as string
  }
  const premiere = await cle('2026-11-24T09:20:00Z')
  expect(await cle('2026-11-24T09:35:00Z')).toBe(premiere)
  expect(await cle('2026-11-25T07:50:00Z')).toBe(premiere)
  const lendemain = await cle('2026-11-25T08:20:00Z')
  expect(lendemain).not.toBe(premiere)
  reussite = '2026-11-25T08:30:00.000Z'
  const suivante = await cle('2026-11-25T10:20:00Z')
  expect(suivante).not.toBe(premiere)
  expect(suivante).not.toBe(lendemain)
})

test('une installation jamais confirmée n’est pas une panne', async () => {
  reussite = null
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.envoyer).not.toHaveBeenCalled()
})

test.each([
  ['une erreur de base', { data: null, error: { message: 'DETAIL_PRIVE' } }],
  ['un état sans date', { data: {}, error: null }],
  ['une date illisible', { data: { derniere_reussite: 'hier' }, error: null }],
  ['un type inattendu', { data: { derniere_reussite: 12 }, error: null }],
])('maintenance : %s compte un échec, sans courriel ni détail journalisé', async (_, rendu) => {
  d.rpc.mockImplementation(async (nom: string) =>
    nom === 'etat_maintenance'
      ? rendu
      : { data: { version: 1, traitements: actes, reprises_a_examiner: 0 }, error: null },
  )
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 1 })
  expect(d.envoyer).not.toHaveBeenCalled()
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('DETAIL_PRIVE')
})

test('lancé par GitHub ou Vercel après un retard, le courriel désigne pg_cron', async () => {
  reussite = ilYA(400)
  await veillerPlanificateurs(MIDI, 'github-ou-vercel')
  const texte = d.envoyer.mock.calls[0]![2] as string
  expect(texte).toContain('lancé par GitHub ou par Vercel, pas par Supabase')
  expect(texte).toContain('probablement arrêté')
  expect(texte).not.toContain('lancé par Supabase (pg_cron)')
})

test('un traitement d’acte muet depuis plus de 45 minutes est à l’arrêt', async () => {
  actes!.archives = { confirme_le: ilYA(45), reussi: true }
  await veillerPlanificateurs(MIDI)
  expect(d.envoyer).not.toHaveBeenCalled()
  actes!.archives = { confirme_le: ilYA(130), reussi: true }
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.envoyer).toHaveBeenCalledOnce()
  const [a, sujet, texte, , , differe] = d.envoyer.mock.calls[0]!
  expect(a).toBe('exploitant@example.invalid')
  expect(sujet).toBe('[Cloison] Actes : archivage des actes signés à l’arrêt depuis 2 h 10')
  expect(texte).toContain('cloison-archives-http')
  expect(texte).toContain('mardi 24 novembre 2026 à 10:55')
  expect(differe).toBe(true)
})

test('un traitement arrêté garde sa clé tant qu’il ne repart pas, puis un rappel par jour', async () => {
  actes!.signature = { confirme_le: '2026-11-24T08:00:00.000Z', reussi: false }
  const cle = async (maintenant: string) => {
    d.envoyer.mockClear()
    reussite = ilYA(5, new Date(maintenant))
    actes!.archives = actes!.reglements = {
      confirme_le: ilYA(2, new Date(maintenant)),
      reussi: true,
    }
    await veillerPlanificateurs(new Date(maintenant))
    expect(d.envoyer).toHaveBeenCalledOnce()
    return d.envoyer.mock.calls[0]![3] as string
  }
  const premiere = await cle('2026-11-24T09:20:00Z')
  expect(await cle('2026-11-24T20:35:00Z')).toBe(premiere)
  expect(await cle('2026-11-25T08:20:00Z')).not.toBe(premiere)
})

test('un traitement dont le dernier passage a échoué prévient une fois par jour civil', async () => {
  const cle = async (maintenant: string, minutes: number) => {
    d.envoyer.mockClear()
    const instant = new Date(maintenant)
    reussite = ilYA(5, instant)
    actes = {
      signature: { confirme_le: ilYA(2, instant), reussi: true },
      archives: { confirme_le: ilYA(2, instant), reussi: true },
      // Chaque passage en échec réécrit la date : elle ne peut pas servir de clé.
      reglements: { confirme_le: ilYA(minutes, instant), reussi: false },
    }
    await veillerPlanificateurs(instant)
    expect(d.envoyer).toHaveBeenCalledOnce()
    expect(d.envoyer.mock.calls[0]![1]).toBe(
      '[Cloison] Actes : rapprochement des règlements en échec',
    )
    return d.envoyer.mock.calls[0]![3] as string
  }
  const premiere = await cle('2026-11-24T09:20:00Z', 1)
  expect(await cle('2026-11-24T22:50:00Z', 4)).toBe(premiere)
  expect(await cle('2026-11-25T00:05:00Z', 2)).not.toBe(premiere)
})

test('deux traitements en panne donnent deux courriels', async () => {
  actes!.signature = { confirme_le: ilYA(200), reussi: true }
  actes!.reglements = { confirme_le: ilYA(1), reussi: false }
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.envoyer.mock.calls.map((appel) => appel[1])).toEqual([
    '[Cloison] Actes : rapprochement des signatures à l’arrêt depuis 3 h 20',
    '[Cloison] Actes : rapprochement des règlements en échec',
  ])
  expect(d.envoyer.mock.calls[0]![3]).not.toBe(d.envoyer.mock.calls[1]![3])
})

test('des traitements jamais confirmés ne sont pas une panne', async () => {
  actes = {
    signature: { confirme_le: null, reussi: false },
    archives: { confirme_le: null, reussi: false },
    reglements: { confirme_le: null, reussi: false },
  }
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.envoyer).not.toHaveBeenCalled()
})

test.each([
  ['une erreur de base', null],
  ['un traitement manquant', { signature: { confirme_le: null, reussi: true } }],
  ['une date illisible', { ...frais(), archives: { confirme_le: 'hier', reussi: true } }],
  ['un indicateur de réussite absent', { ...frais(), archives: { confirme_le: ilYA(3) } }],
])('actes : %s compte un échec, sans courriel', async (_, traitements) => {
  actes = traitements as never
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 1 })
  expect(d.envoyer).not.toHaveBeenCalled()
})

test('une mise en file refusée compte un échec : l’alerte sera rejouée', async () => {
  reussite = ilYA(190)
  d.envoyer.mockResolvedValue(false)
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 1 })
})

test.each([
  [
    'absente',
    { dernier_passage: ilYA(1700), derniere_reussite: ilYA(1700), etapes_en_echec: [] },
    '[Cloison] Supervision GitHub à l’arrêt depuis 1 j 4 h',
    'Aucun passage planifié',
  ],
  [
    'en_echec',
    {
      dernier_passage: ilYA(5),
      derniere_reussite: ilYA(4500),
      etapes_en_echec: ['rapport : Derive du schema de production'],
    },
    '[Cloison] Supervision GitHub sans réussite depuis 3 j 3 h',
    '  - rapport : Derive du schema de production',
  ],
  [
    'en_echec',
    { dernier_passage: ilYA(5), derniere_reussite: null, etapes_en_echec: [] },
    '[Cloison] Supervision GitHub sans réussite',
    'aucune dans l’historique récent',
  ],
  [
    'desactivee',
    { dernier_passage: ilYA(90000), derniere_reussite: ilYA(90000), etapes_en_echec: [] },
    '[Cloison] Supervision GitHub désactivée',
    '60 jours sans activité',
  ],
])('une supervision %s prévient l’exploitant', async (etat, reperes, sujet, extrait) => {
  d.observer.mockResolvedValue({ etat, ...reperes })
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.envoyer).toHaveBeenCalledOnce()
  const [a, recu, texte, , , differe] = d.envoyer.mock.calls[0]!
  expect(a).toBe('exploitant@example.invalid')
  expect(recu).toBe(sujet)
  expect(texte).toContain(extrait)
  expect(texte).toContain('Ce courriel ne contient aucune donnée de dossier.')
  if (!reperes.etapes_en_echec.length) expect(texte).not.toContain('Étapes en échec')
  expect(differe).toBe(true)
})

test('une supervision arrêtée donne un courriel par panne, puis un rappel par jour', async () => {
  // La maintenance et les actes n'ont rien à dire ici : seule la supervision écrit.
  reussite = null
  actes = Object.fromEntries(
    Object.keys(frais()).map((nom) => [nom, { confirme_le: null, reussi: false }]),
  )
  d.observer.mockResolvedValue({
    etat: 'absente',
    dernier_passage: '2026-11-23T06:17:00.000Z',
    derniere_reussite: '2026-11-23T06:17:00.000Z',
    etapes_en_echec: [],
  })
  const cle = async (maintenant: string) => {
    d.envoyer.mockClear()
    await veillerPlanificateurs(new Date(maintenant))
    return d.envoyer.mock.calls[0]![3] as string
  }
  const premiere = await cle('2026-11-24T07:00:00Z')
  expect(await cle('2026-11-24T11:05:00Z')).toBe(premiere)
  expect(await cle('2026-11-25T06:10:00Z')).toBe(premiere)
  expect(await cle('2026-11-25T07:00:00Z')).not.toBe(premiere)
})

test('la supervision n’est lue que le premier quart de chaque heure', async () => {
  for (const [instant, lue] of [
    ['2026-11-24T12:00:00Z', true],
    ['2026-11-24T12:14:59Z', true],
    ['2026-11-24T12:15:00Z', false],
    ['2026-11-24T12:59:00Z', false],
  ] as const) {
    d.observer.mockClear()
    await veillerPlanificateurs(new Date(instant))
    expect(d.observer).toHaveBeenCalledTimes(lue ? 1 : 0)
  }
})

test('une lecture GitHub impossible n’est ni un vert ni une alerte, et ne casse pas la maintenance', async () => {
  d.observer.mockRejectedValue(new Error('Planificateur illisible'))
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.envoyer).not.toHaveBeenCalled()
  expect(vi.mocked(console.error)).toHaveBeenCalledWith('[veille] supervision GitHub illisible')
})

test('le jeton facultatif est transmis à la lecture, jamais écrit dans un courriel', async () => {
  vi.stubEnv('VEILLE_GITHUB_JETON', ' github_pat_jetonfictifjetonfictif ')
  d.observer.mockResolvedValue({
    etat: 'absente',
    dernier_passage: null,
    derniere_reussite: null,
    etapes_en_echec: [],
  })
  await veillerPlanificateurs(MIDI)
  expect(d.observer.mock.calls[0]![1].jeton).toBe('github_pat_jetonfictifjetonfictif')
  expect(JSON.stringify(d.envoyer.mock.calls)).not.toContain('jetonfictif')
  vi.unstubAllEnvs()
  d.observer.mockClear()
  await veillerPlanificateurs(MIDI)
  expect(Object.keys(d.observer.mock.calls[0]![1])).not.toContain('jeton')
})

test('les deux pannes ensemble donnent deux courriels distincts', async () => {
  reussite = ilYA(300)
  d.observer.mockResolvedValue({
    etat: 'absente',
    dernier_passage: ilYA(3000),
    derniere_reussite: ilYA(3000),
    etapes_en_echec: [],
  })
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 0 })
  expect(d.envoyer).toHaveBeenCalledTimes(2)
  expect(d.envoyer.mock.calls[0]![3]).not.toBe(d.envoyer.mock.calls[1]![3])
})

test('une base indisponible au moment d’alerter sur la supervision compte un échec', async () => {
  d.observer.mockResolvedValue({
    etat: 'absente',
    dernier_passage: null,
    derniere_reussite: null,
    etapes_en_echec: [],
  })
  d.client.mockRejectedValue(new Error('DETAIL_PRIVE'))
  // Les lectures de la maintenance et des actes échouent aussi : trois échecs, aucun détail.
  expect(await veillerPlanificateurs(MIDI)).toEqual({ echecs: 3 })
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('DETAIL_PRIVE')
})
