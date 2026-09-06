import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { creerSessionLocataire } from '@/lib/paiement/stripe'

const doubles = vi.hoisted(() => ({ client: vi.fn(), creer: vi.fn(), retrouver: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: doubles.client }))
vi.mock('@/lib/env', () => ({ env: { stripeSecretKey: 'sk_test_fixture_non_secret' } }))
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: doubles.creer, retrieve: doubles.retrouver } }
  },
}))

const MAINTENANT = new Date('2026-09-06T10:00:00Z')
const DOSSIER = '44444444-4444-4444-4444-444444444444'
const TENTATIVE = '55555555-5555-4555-8555-555555555555'
const OPTIONS = {
  dossierId: DOSSIER,
  reference: 'CL-FICTIF',
  email: 'essai@example.invalid',
  retourOk: 'https://example.invalid/locataire?paiement=ok',
  retourAnnule: 'https://example.invalid/locataire?paiement=annule',
}
type Ligne = { dossier_id: string; tentative: string; session_ref: string | null; cree_le: string }
type Session = { id: string; url: string; status: 'open' | 'complete' | 'expired' }
let ligne: Ligne
let sessions: Map<string, Session>
let perdreReponseStripe: boolean
let perdreInscription: 'avant' | 'apres' | null
let inscriptionSansLigne: boolean

/** Modele deterministe : snapshot de lecture, UPDATE compare-and-swap atomique,
 * et lignes effectivement touchees seulement si le client demande select(). */
function base() {
  return {
    from(table: string) {
      expect(table).toBe('sessions_paiement')
      let modification: Partial<Ligne> | null = null
      let selection = false
      const filtres: Record<string, unknown> = {}
      const executer = async () => {
        if (!modification) return { data: { ...ligne }, error: null }
        const inscription = !('tentative' in modification)
        if (inscription && perdreInscription === 'avant') {
          perdreInscription = null
          return { data: null, error: { message: 'panne fictive avant commit' } }
        }
        const correspond = Object.entries(filtres).every(
          ([champ, valeur]) => ligne[champ as keyof Ligne] === valeur,
        )
        const touchees = correspond && !(inscription && inscriptionSansLigne)
        if (touchees) Object.assign(ligne, modification)
        if (inscription && perdreInscription === 'apres') {
          perdreInscription = null
          return { data: null, error: { message: 'reponse fictive perdue apres commit' } }
        }
        return { data: selection ? (touchees ? [{ ...ligne }] : []) : null, error: null }
      }
      const requete = {
        upsert: async () => ({ error: null }),
        select: () => {
          selection = true
          return requete
        },
        eq: (champ: string, valeur: unknown) => {
          filtres[champ] = valeur
          return requete
        },
        update: (valeurs: Partial<Ligne>) => {
          modification = valeurs
          return requete
        },
        single: executer,
        then: (
          succes: (valeur: Awaited<ReturnType<typeof executer>>) => unknown,
          echec: (erreur: unknown) => unknown,
        ) => executer().then(succes, echec),
      }
      return requete
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(MAINTENANT)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  ligne = {
    dossier_id: DOSSIER,
    tentative: TENTATIVE,
    session_ref: null,
    cree_le: MAINTENANT.toISOString(),
  }
  sessions = new Map()
  perdreReponseStripe = false
  perdreInscription = null
  inscriptionSansLigne = false
  doubles.client.mockImplementation(async () => base())
  doubles.creer.mockImplementation(
    async (_parametres: unknown, options: { idempotencyKey: string }) => {
      let session = sessions.get(options.idempotencyKey)
      if (!session) {
        session = {
          id: `cs_fixture_${sessions.size + 1}`,
          url: `https://checkout.example.invalid/${sessions.size + 1}`,
          status: 'open',
        }
        sessions.set(options.idempotencyKey, session)
      }
      if (perdreReponseStripe) {
        perdreReponseStripe = false
        throw new Error('reponse perdue apres creation Stripe fictive')
      }
      return session
    },
  )
  doubles.retrouver.mockImplementation(async (id: string) =>
    [...sessions.values()].find((session) => session.id === id),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function clesUtilisees() {
  return doubles.creer.mock.calls.map((appel) => appel[1].idempotencyKey)
}

test('une creation Stripe reussie mais sa reponse perdue reprend la meme session', async () => {
  perdreReponseStripe = true
  expect(await creerSessionLocataire(OPTIONS)).toBeNull()
  expect(await creerSessionLocataire(OPTIONS)).toBe('https://checkout.example.invalid/1')
  expect(sessions.size).toBe(1)
  expect(clesUtilisees()).toEqual([
    `cloison:${DOSSIER}:${TENTATIVE}`,
    `cloison:${DOSSIER}:${TENTATIVE}`,
  ])
  expect(ligne.session_ref).toBe('cs_fixture_1')
})

test('un echec SQL avant inscription reprend la meme cle et la meme session', async () => {
  perdreInscription = 'avant'
  expect(await creerSessionLocataire(OPTIONS)).toBeNull()
  expect(await creerSessionLocataire(OPTIONS)).toBe('https://checkout.example.invalid/1')
  expect(sessions.size).toBe(1)
  expect(new Set(clesUtilisees()).size).toBe(1)
  expect(doubles.creer).toHaveBeenCalledTimes(2)
})

test('une inscription commise avec reponse perdue retrouve la session au lieu de recreer', async () => {
  perdreInscription = 'apres'
  expect(await creerSessionLocataire(OPTIONS)).toBeNull()
  expect(await creerSessionLocataire(OPTIONS)).toBe('https://checkout.example.invalid/1')
  expect(doubles.creer).toHaveBeenCalledOnce()
  expect(doubles.retrouver).toHaveBeenCalledExactlyOnceWith('cs_fixture_1')
})

test('deux rotations concurrentes d une session expiree n ont qu un gagnant', async () => {
  ligne.session_ref = 'cs_expiree'
  let arrivants = 0
  let liberer!: () => void
  const barriere = new Promise<void>((resolve) => {
    liberer = resolve
  })
  doubles.retrouver.mockImplementation(async () => {
    arrivants++
    if (arrivants === 2) liberer()
    await barriere
    return { id: 'cs_expiree', status: 'expired', url: null }
  })
  const resultats = await Promise.all([
    creerSessionLocataire(OPTIONS),
    creerSessionLocataire(OPTIONS),
  ])
  expect(resultats.filter(Boolean)).toEqual(['https://checkout.example.invalid/1'])
  expect(resultats.filter((url) => url === null)).toHaveLength(1)
  expect(doubles.creer).toHaveBeenCalledOnce()
  expect(ligne.tentative).not.toBe(TENTATIVE)
  expect(sessions.size).toBe(1)
})

test('une session complete ne devient pas une nouvelle session payable', async () => {
  ligne.session_ref = 'cs_complete'
  doubles.retrouver.mockResolvedValue({ id: 'cs_complete', status: 'complete', url: null })
  expect(await creerSessionLocataire(OPTIONS)).toBeNull()
  expect(doubles.creer).not.toHaveBeenCalled()
})

for (const [nom, date] of [
  [
    'exactement vingt-trois heures',
    new Date(MAINTENANT.getTime() - 23 * 60 * 60 * 1000).toISOString(),
  ],
  [
    'plus de vingt-trois heures',
    new Date(MAINTENANT.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  ],
  ['une date invalide', 'date-invalide'],
  ['une date future d un jour', new Date(MAINTENANT.getTime() + 24 * 60 * 60 * 1000).toISOString()],
]) {
  test(`une tentative sans reference avec ${nom} ne cree rien`, async () => {
    ligne.cree_le = date!
    expect(await creerSessionLocataire(OPTIONS)).toBeNull()
    expect(doubles.creer).not.toHaveBeenCalled()
  })
}

test('une inscription qui ne touche aucune ligne ne rend pas une URL obsolete', async () => {
  inscriptionSansLigne = true
  expect(await creerSessionLocataire(OPTIONS)).toBeNull()
  expect(ligne.session_ref).toBeNull()
  expect(sessions.size).toBe(1)
})
