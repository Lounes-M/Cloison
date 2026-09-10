import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const doubles = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: doubles.client }))
import { nouvelleCleConnecteur, empreinteConnecteur } from '@/lib/connecteurs/cles'
import { lireStatuts } from '@/lib/connecteurs/lecture'
const cle = nouvelleCleConnecteur(),
  donnees = { version: 1, dossiers: [{ reference: 'REFERENCE0001', etat: 'pret' }], suite: null }
const req = (autorisation = `Bearer ${cle}`, query = '') =>
  new Request('https://cloison.invalid/api/connecteurs/v1/dossiers' + query, {
    headers: { authorization: autorisation },
  })
beforeEach(() => {
  doubles.client.mockResolvedValue({ rpc: doubles.rpc })
  doubles.rpc.mockResolvedValue({ data: donnees, error: null })
})
afterEach(() => vi.resetAllMocks())
test('une exception reseau ne divulgue aucun detail', async () => {
  doubles.client.mockRejectedValue(new Error('donnee-privee'))
  const r = await lireStatuts(req())
  expect(r.status).toBe(503)
  expect(await r.text()).not.toContain('donnee-privee')
})
test('genere des cles aleatoires et ne stocke que leur empreinte', () => {
  expect(cle).toMatch(/^cloison_read_[A-Za-z0-9_-]{43}$/)
  expect(nouvelleCleConnecteur()).not.toBe(cle)
  expect(empreinteConnecteur(cle)).toMatch(/^[a-f0-9]{64}$/)
  expect(empreinteConnecteur('invalide')).toBeNull()
})
test.each(['', 'Basic fictif', 'Bearer fictif'])(
  'refuse une autorisation invalide avant la base',
  async (auth) => {
    expect((await lireStatuts(req(auth))).status).toBe(401)
    expect(doubles.client).not.toHaveBeenCalled()
  },
)
test.each(['?token=fictif', '?apres=x', '?apres=REFERENCE0001&apres=REFERENCE0002'])(
  'refuse une requete ambigue',
  async (query) => {
    expect((await lireStatuts(req(undefined, query))).status).toBe(400)
    expect(doubles.client).not.toHaveBeenCalled()
  },
)
test('ne transmet pas la cle brute et ne met pas les donnees en cache', async () => {
  const r = await lireStatuts(req())
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual(donnees)
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(doubles.rpc).toHaveBeenCalledWith('lire_statuts_connecteur', {
    l_empreinte: empreinteConnecteur(cle),
    apres: null,
  })
  expect(JSON.stringify(doubles.rpc.mock.calls)).not.toContain(cle)
})
test.each([
  { data: null, error: null, statut: 401 },
  { data: { limite: true }, error: null, statut: 429 },
  { data: donnees, error: { message: 'prive' }, statut: 503 },
  { data: { ...donnees, email: 'prive' }, error: null, statut: 503 },
  {
    data: { ...donnees, dossiers: [{ reference: 'REFERENCE0001', etat: 'pret', revenu: 9999 }] },
    error: null,
    statut: 503,
  },
])('une panne ou projection elargie ne divulgue rien (%#)', async ({ data, error, statut }) => {
  doubles.rpc.mockResolvedValue({ data, error })
  const r = await lireStatuts(req())
  expect(r.status).toBe(statut)
  expect(await r.text()).not.toMatch(/prive|9999/)
  if (statut === 429) expect(r.headers.get('retry-after')).toBe('60')
})
