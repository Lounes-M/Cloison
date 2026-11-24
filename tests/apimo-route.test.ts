import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const doubles = vi.hoisted(() => ({ serveur: vi.fn(), rendre: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: doubles.serveur }))
vi.mock('@/lib/connecteurs/apimo/retours', () => ({ rendreEtatsApimo: doubles.rendre }))
import { GET } from '@/app/api/connecteurs/apimo/retours/route'

const appel = (autorisation?: string) =>
  GET(
    new Request('https://www.cloison.immo/api/connecteurs/apimo/retours', {
      headers: autorisation ? { authorization: autorisation } : {},
    }),
  )
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'fictif')
  vi.stubEnv('CONNECTEUR_APIMO', 'true')
  vi.stubEnv('APIMO_RETOUR_STATUT', 'true')
  doubles.serveur.mockResolvedValue({})
  doubles.rendre.mockResolvedValue({ traites: 2, echecs: 1 })
})
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

test.each([undefined, 'Bearer faux', 'fictif', 'Bearer '])(
  'refuse %j sans rien lire',
  async (autorisation) => {
    const reponse = await appel(autorisation)
    expect(reponse.status).toBe(401)
    expect(reponse.headers.get('cache-control')).toBe('no-store')
    expect(doubles.serveur).not.toHaveBeenCalled()
  },
)

test('sans secret configure, personne n entre', async () => {
  vi.stubEnv('CRON_SECRET', '')
  expect((await appel('Bearer undefined')).status).toBe(401)
  expect((await appel('Bearer ')).status).toBe(401)
})

test.each([
  ['CONNECTEUR_APIMO', undefined],
  ['APIMO_RETOUR_STATUT', undefined],
  ['APIMO_RETOUR_STATUT', '1'],
  ['CONNECTEUR_APIMO', 'TRUE'],
])('ferme par %s=%j : repond sans lire la base ni appeler Apimo', async (variable, valeur) => {
  vi.stubEnv(variable, valeur ?? '')
  const reponse = await appel('Bearer fictif')
  expect(reponse.status).toBe(200)
  expect(await reponse.json()).toEqual({ actif: false })
  expect(doubles.serveur).not.toHaveBeenCalled()
  expect(doubles.rendre).not.toHaveBeenCalled()
})

test('ouvert, rend le bilan du cycle', async () => {
  const reponse = await appel('Bearer fictif')
  expect(reponse.status).toBe(200)
  expect(await reponse.json()).toEqual({ actif: true, traites: 2, echecs: 1 })
  vi.stubEnv('CRON_SUPABASE_SECRET', 'secondaire')
  expect((await appel('Bearer secondaire')).status).toBe(200)
})

test('une panne du cycle rend 503 sans detail', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  doubles.rendre.mockRejectedValue(new Error('secret-prive'))
  const reponse = await appel('Bearer fictif')
  expect(reponse.status).toBe(503)
  expect(JSON.stringify(await reponse.json())).not.toContain('secret-prive')
})
