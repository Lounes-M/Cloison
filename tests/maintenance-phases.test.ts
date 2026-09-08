import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GET } from '@/app/api/maintenance/route'

const doubles = vi.hoisted(() => ({
  client: vi.fn(),
  notifications: vi.fn(),
  courriels: vi.fn(),
  purge: vi.fn(),
  liens: vi.fn(),
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: doubles.client }))
vi.mock('@/lib/courriels/notifications', () => ({ livrerNotifications: doubles.notifications }))
vi.mock('@/lib/courriels/livraison-liens', () => ({ livrerLiens: doubles.liens }))
vi.mock('@/lib/courriels/file', () => ({ distribuerCourriels: doubles.courriels }))
vi.mock('@/lib/exploitation/purge', () => ({ purgerCoffres: doubles.purge }))
const requete = () =>
  new Request('https://example.test/api/maintenance', {
    headers: { authorization: 'Bearer secret-fictif' },
  })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'secret-fictif')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  doubles.client.mockResolvedValue({})
  doubles.notifications.mockResolvedValue({ echecs: 0 })
  doubles.courriels.mockResolvedValue({ traites: 2, echecs: 0 })
  doubles.purge.mockResolvedValue({ traites: 3, echecs: 0 })
  doubles.liens.mockResolvedValue({ echecs: 0 })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test('la purge precede notifications puis courriels', async () => {
  const resultat = await GET(requete())
  expect(resultat.status).toBe(200)
  expect(doubles.purge.mock.invocationCallOrder[0]).toBeLessThan(
    doubles.notifications.mock.invocationCallOrder[0]!,
  )
  expect(doubles.notifications.mock.invocationCallOrder[0]).toBeLessThan(
    doubles.courriels.mock.invocationCallOrder[0]!,
  )
})

test('un budget de purge epuise laisse un budget neuf aux notifications et courriels', async () => {
  const controleurs: AbortController[] = []
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
    const controleur = new AbortController()
    controleurs.push(controleur)
    return controleur.signal
  })
  doubles.client.mockImplementation(async (signal: AbortSignal) => ({ signal }))
  doubles.purge.mockImplementation(async (db: { signal: AbortSignal }) => {
    controleurs[0]!.abort()
    db.signal.throwIfAborted()
  })
  doubles.notifications.mockImplementation(async (db: { signal: AbortSignal }) => {
    expect(db.signal.aborted).toBe(false)
    return { echecs: 0 }
  })
  doubles.courriels.mockImplementation(async (db: { signal: AbortSignal }) => {
    expect(db.signal.aborted).toBe(false)
    return { traites: 1, echecs: 0 }
  })
  const bilan = await (await GET(requete())).json()
  expect(bilan.purge.echecs).toBe(1)
  expect(bilan.notifications.echecs).toBe(0)
  expect(bilan.courriels).toEqual({ traites: 1, echecs: 0 })
  expect(controleurs).toHaveLength(4)
})

for (const phase of ['notifications', 'courriels', 'purge'] as const) {
  test(`une panne ${phase} ne bloque aucune autre phase ni ne divulgue son erreur`, async () => {
    doubles[phase].mockRejectedValue(new Error('ADRESSE_PRIVEE secret-fictif'))
    const resultat = await GET(requete())
    expect(resultat.status).toBe(503)
    const bilan = await resultat.json()
    expect(bilan[phase].echecs).toBe(1)
    expect(doubles.notifications).toHaveBeenCalledOnce()
    expect(doubles.courriels).toHaveBeenCalledOnce()
    expect(doubles.purge).toHaveBeenCalledOnce()
    expect(JSON.stringify(bilan)).not.toMatch(/ADRESSE_PRIVEE|secret-fictif/)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
      /ADRESSE_PRIVEE|secret-fictif/,
    )
  })
}

test('le bilan ne transmet que les compteurs attendus', async () => {
  doubles.purge.mockResolvedValue({ traites: 3, echecs: 0, detail: 'ADRESSE_PRIVEE' })
  expect(await (await GET(requete())).json()).toEqual({
    notifications: { echecs: 0 },
    courriels: { traites: 2, echecs: 0 },
    purge: { traites: 3, echecs: 0 },
  })
})

test('un compteur invalide ne devient pas un faux succes', async () => {
  doubles.purge.mockResolvedValue({ traites: -1, echecs: 0 })
  const resultat = await GET(requete())
  expect(resultat.status).toBe(503)
  expect((await resultat.json()).purge).toEqual({ traites: 0, echecs: 1 })
  expect(doubles.courriels).toHaveBeenCalledOnce()
})

test('un appel non autorise ne construit aucun client', async () => {
  expect((await GET(new Request('https://example.test/api/maintenance'))).status).toBe(401)
  expect(doubles.client).not.toHaveBeenCalled()
})

test('une connexion impossible rend un bilan controle sans lancer les phases', async () => {
  doubles.client.mockRejectedValue(new Error('ADRESSE_PRIVEE secret-fictif'))
  const resultat = await GET(requete())
  expect(resultat.status).toBe(503)
  expect(await resultat.json()).toEqual({
    notifications: { echecs: 1 },
    courriels: { traites: 0, echecs: 1 },
    purge: { traites: 0, echecs: 1 },
  })
  expect(doubles.purge).not.toHaveBeenCalled()
  expect(doubles.notifications).not.toHaveBeenCalled()
  expect(doubles.courriels).not.toHaveBeenCalled()
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
    /ADRESSE_PRIVEE|secret-fictif/,
  )
})

test('une panne de preparation des liens laisse les autres phases fonctionner', async () => {
  doubles.liens.mockRejectedValue(new Error('ADRESSE_PRIVEE'))
  const resultat = await GET(requete())
  expect(resultat.status).toBe(503)
  expect((await resultat.json()).notifications.echecs).toBe(1)
  expect(doubles.notifications).toHaveBeenCalledOnce()
  expect(doubles.courriels).toHaveBeenCalledOnce()
  expect(doubles.purge).toHaveBeenCalledOnce()
})
