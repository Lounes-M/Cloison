import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  creerSessionLocataire,
  lireSessionPourRapprochement,
  retrouverSessionFinanciere,
} from '@/lib/paiement/stripe'

const doubles = vi.hoisted(() => ({
  client: vi.fn(),
  creer: vi.fn(),
  retrouver: vi.fn(),
  lister: vi.fn(),
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: doubles.client }))
vi.mock('@/lib/env', () => ({ env: { stripeSecretKey: 'sk_test_fixture_non_secret' } }))
vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: { create: doubles.creer, retrieve: doubles.retrouver, list: doubles.lister },
    }
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
type Ligne = {
  tarif_version: string
  montant_cents: number
  devise: string
  dossier_id: string
  tentative: string
  session_ref: string | null
  cree_le: string
}
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
    tarif_version: 'locataire-2026-09-04',
    montant_cents: 900,
    devise: 'eur',
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
          ...contexteSession(),
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

test('une reprise utilise le tarif reserve et le transmet a Stripe', async () => {
  ligne.montant_cents = 800
  ligne.tarif_version = 'locataire-ancien'
  expect(await creerSessionLocataire(OPTIONS)).not.toBeNull()
  expect(doubles.creer).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: expect.objectContaining({ tarif_version: 'locataire-ancien' }),
      line_items: [
        expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 800 }) }),
      ],
    }),
    expect.anything(),
  )
})

test('la lecture fournisseur refuse un autre dossier dans client_reference_id', async () => {
  doubles.retrouver.mockResolvedValueOnce({
    id: 'cs_fixture',
    mode: 'payment',
    payment_status: 'paid',
    payment_intent: 'pi_fixture',
    amount_total: 900,
    currency: 'eur',
    metadata: { dossier_id: DOSSIER },
    client_reference_id: '66666666-6666-4666-8666-666666666666',
  })
  await expect(lireSessionPourRapprochement('cs_fixture')).rejects.toThrow('incoherente')
})
test('une session sans metadonnee Cloison nest pas rattachee au registre', async () => {
  doubles.lister.mockResolvedValueOnce({
    data: [{ id: 'cs_autre', metadata: {}, payment_intent: 'pi_fixture' }],
    has_more: false,
  })
  expect(await retrouverSessionFinanciere('pi_fixture')).toBeNull()
  expect(doubles.lister).toHaveBeenCalledWith({ payment_intent: 'pi_fixture', limit: 2 })
})
test('une reference fournisseur differente ne peut pas etre rattachee', async () => {
  doubles.lister.mockResolvedValueOnce({
    data: [
      {
        id: 'cs_fixture',
        mode: 'payment',
        metadata: { dossier_id: DOSSIER },
        payment_intent: 'pi_autre',
      },
    ],
    has_more: false,
  })
  await expect(retrouverSessionFinanciere('pi_fixture')).rejects.toThrow('incoherente')
})

test('un devis affiche different du tarif reserve refuse de creer Checkout', async () => {
  expect(
    await creerSessionLocataire({
      ...OPTIONS,
      tarifAttendu: { version: 'locataire-2026-09-04', montant: 800 },
    }),
  ).toBeNull()
  expect(doubles.creer).not.toHaveBeenCalled()
  expect(doubles.retrouver).not.toHaveBeenCalled()
})

function contexteSession() {
  return {
    mode: 'payment',
    payment_status: 'unpaid',
    client_reference_id: DOSSIER,
    metadata: { dossier_id: DOSSIER, tarif_version: ligne.tarif_version },
    amount_total: ligne.montant_cents,
    currency: ligne.devise,
  }
}

for (const [nom, changement] of [
  ['une autre reference', { id: 'cs_autre' }],
  [
    'un autre dossier',
    { metadata: { dossier_id: TENTATIVE, tarif_version: 'locataire-2026-09-04' } },
  ],
  ['un client contradictoire', { client_reference_id: TENTATIVE }],
  ['un montant different', { amount_total: 1000 }],
  ['une autre devise', { currency: 'usd' }],
  ['une autre version', { metadata: { dossier_id: DOSSIER, tarif_version: 'locataire-autre' } }],
  ['un abonnement', { mode: 'subscription' }],
  ['un paiement deja regle', { payment_status: 'paid' }],
] as const) {
  test(`une session ouverte avec ${nom} ne peut pas etre reproposee`, async () => {
    await creerSessionLocataire(OPTIONS)
    doubles.creer.mockClear()
    doubles.retrouver.mockResolvedValueOnce({
      ...contexteSession(),
      id: 'cs_fixture_1',
      status: 'open',
      url: 'https://checkout.example.invalid/1',
      ...changement,
    })
    expect(await creerSessionLocataire(OPTIONS)).toBeNull()
    expect(doubles.creer).not.toHaveBeenCalled()
    expect(ligne.session_ref).toBe('cs_fixture_1')
    expect(ligne.tentative).toBe(TENTATIVE)
  })
}

test('une session ouverte historique conserve son tarif reserve sans metadonnee de version', async () => {
  ligne.montant_cents = 800
  await creerSessionLocataire(OPTIONS)
  doubles.retrouver.mockResolvedValueOnce({
    ...contexteSession(),
    id: 'cs_fixture_1',
    status: 'open',
    url: 'https://checkout.example.invalid/1',
    metadata: { dossier_id: DOSSIER },
  })
  expect(await creerSessionLocataire(OPTIONS)).toBe('https://checkout.example.invalid/1')
  expect(doubles.creer).toHaveBeenCalledOnce()
})
