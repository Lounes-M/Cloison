import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const doubles = vi.hoisted(() => ({
  contexte: vi.fn(),
  reserver: vi.fn(),
  lire: vi.fn(),
  piece: vi.fn(),
  verifier: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: doubles.contexte }))
vi.mock('@/lib/coffre/ouverture-supabase', () => ({
  baseOuvertureSupabase: () => ({ piece: doubles.piece }),
}))
vi.mock('@/lib/coffre/ouverture', () => ({ lireCodePourLAgence: doubles.lire }))
vi.mock('@/lib/2ddoc/verification', () => ({ verifierCode2dDoc: doubles.verifier }))
import { verifierAvisPour } from '@/lib/2ddoc/verification-agence'

const id = '11111111-1111-4111-8111-111111111111'
const requete = (origin = 'https://cloison.invalid', explicite = 'verification-explicite') =>
  new Request(`https://cloison.invalid/espace/pieces/${id}/authenticite`, {
    method: 'POST',
    headers: { origin, 'x-cloison-2ddoc': explicite },
  })
const AUTHENTIQUE = { etat: 'authentique', emetteur: 'Fictif', signeLe: '2025-07-31', valeurs: {} }

beforeEach(() => {
  vi.stubEnv('VERIFICATION_2DDOC_ACTIVE', 'true')
  doubles.contexte.mockResolvedValue({
    etat: 'rattache',
    email: 'agence@example.invalid',
    supabase: { rpc: doubles.reserver },
  })
  doubles.reserver.mockResolvedValue({ data: true, error: null })
  doubles.lire.mockResolvedValue(Buffer.from('DC04'))
  doubles.piece.mockResolvedValue({ dossierId: id })
  doubles.verifier.mockResolvedValue(AUTHENTIQUE)
})
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

test('une verification reservee rend le resultat, sans cache', async () => {
  const reponse = await verifierAvisPour(requete(), id)
  expect(reponse.status).toBe(200)
  expect(reponse.headers.get('cache-control')).toBe('no-store')
  expect(await reponse.json()).toEqual(AUTHENTIQUE)
  expect(doubles.reserver).toHaveBeenCalledExactlyOnceWith('reserver_verification_2ddoc', {
    la_piece: id,
  })
})

test.each([
  ['https://tiers.invalid', 'verification-explicite'],
  ['null', 'verification-explicite'],
  ['https://cloison.invalid', ''],
])('refuse une requete non explicite de meme origine', async (origine, enTete) => {
  expect((await verifierAvisPour(requete(origine, enTete), id)).status).toBe(403)
  expect(doubles.contexte).not.toHaveBeenCalled()
})

test('sans activation explicite, rien n est reserve ni lu', async () => {
  vi.stubEnv('VERIFICATION_2DDOC_ACTIVE', '')
  expect((await verifierAvisPour(requete(), id)).status).toBe(503)
  expect(doubles.contexte).not.toHaveBeenCalled()
  expect(doubles.lire).not.toHaveBeenCalled()
})

test('un identifiant qui n est pas un UUID ne touche a rien', async () => {
  expect((await verifierAvisPour(requete(), 'pas-un-uuid')).status).toBe(404)
  expect(doubles.contexte).not.toHaveBeenCalled()
})

test.each(['anonyme', 'non-rattache'])('aucune lecture pour %s', async (etat) => {
  doubles.contexte.mockResolvedValue({ etat })
  expect((await verifierAvisPour(requete(), id)).status).toBe(401)
  expect(doubles.reserver).not.toHaveBeenCalled()
  expect(doubles.lire).not.toHaveBeenCalled()
})

test.each([
  { data: false, error: null },
  { data: null, error: null },
  { data: true, error: {} },
])('droits, nature, quota et journal doivent etre confirmes avant dechiffrement', async (r) => {
  doubles.reserver.mockResolvedValue(r)
  expect((await verifierAvisPour(requete(), id)).status).toBe(404)
  expect(doubles.lire).not.toHaveBeenCalled()
  expect(doubles.verifier).not.toHaveBeenCalled()
})

test('une piece illisible est une indisponibilite, pas un verdict', async () => {
  doubles.lire.mockResolvedValue(null)
  const reponse = await verifierAvisPour(requete(), id)
  expect(reponse.status).toBe(503)
  expect(await reponse.json()).toBeNull()
  expect(doubles.verifier).not.toHaveBeenCalled()
})

test('un acces retire pendant la verification ne recoit pas le resultat', async () => {
  doubles.piece.mockResolvedValue(null)
  const reponse = await verifierAvisPour(requete(), id)
  expect(reponse.status).toBe(404)
  expect(await reponse.json()).toBeNull()
})

test('une panne interne ne laisse sortir aucun detail', async () => {
  doubles.verifier.mockRejectedValue(new Error('contenu prive fictif'))
  const reponse = await verifierAvisPour(requete(), id)
  expect(reponse.status).toBe(503)
  expect(await reponse.text()).toBe('null')
})
