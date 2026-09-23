import { afterEach, expect, test, vi } from 'vitest'
// @ts-expect-error Script operateur JavaScript.
import { traiterActes } from '../scripts/traiter-actes.mjs'
const chemins = [
  '/api/signature/rapprochement',
  '/api/signature/traitement',
  '/api/paiement/actes/rapprochement',
]
const succes = (index: number) =>
  Response.json({ actif: false, traites: 0, echecs: 0, ...(index === 1 ? { effaces: 0 } : {}) })
afterEach(() => vi.unstubAllGlobals())
test('tous les traitements sont authentifies, bornes et executes une seule fois', async () => {
  const f = vi.fn(async () => succes(f.mock.calls.length - 1))
  vi.stubGlobal('fetch', f)
  expect(await traiterActes('secret-fictif')).toEqual({ confirme: true })
  expect(f.mock.calls.map((c: unknown[]) => c[0])).toEqual(
    chemins.map((p) => 'https://www.cloison.immo' + p),
  )
  for (const appel of f.mock.calls as unknown as [string, RequestInit][]) {
    expect(appel[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer secret-fictif' },
      redirect: 'error',
    })
    expect(appel[1].signal).toBeInstanceOf(AbortSignal)
  }
})
test.each([0, 1, 2])(
  'un echec du traitement %i ne bloque pas les autres et reste signale',
  async (index) => {
    for (const panne of ['http', 'reseau', 'json', 'compteur']) {
      let appel = 0
      const f = vi.fn(async () => {
        const courant = appel++
        if (courant !== index) return succes(courant)
        if (panne === 'reseau') throw new Error('SECRET_PRIVE')
        if (panne === 'http') return new Response('SECRET_PRIVE', { status: 503 })
        if (panne === 'json') return new Response('SECRET_PRIVE')
        return Response.json({ actif: true, traites: 0, echecs: 1, effaces: 0 })
      })
      vi.stubGlobal('fetch', f)
      await expect(traiterActes('secret-fictif')).rejects.toThrow(
        /^Traitement des actes incomplet$/,
      )
      expect(f).toHaveBeenCalledTimes(3)
    }
  },
)
test.each([
  [0, 3],
  [1, 2],
  [2, 4],
])('le traitement %i refuse un compteur superieur a sa limite', async (index, compteur) => {
  let appel = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const courant = appel++
      return courant === index
        ? Response.json({ actif: true, traites: compteur, echecs: 0, effaces: 0 })
        : succes(courant)
    }),
  )
  await expect(traiterActes('secret-fictif')).rejects.toThrow('Traitement des actes incomplet')
  expect(appel).toBe(3)
})
test('une erreur HTTP annule son corps et ne masque pas la conservation suivante', async () => {
  const annuler = vi.fn()
  const corps = new ReadableStream({ cancel: annuler })
  let appel = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (appel++ === 0 ? new Response(corps, { status: 503 }) : succes(appel - 1))),
  )
  await expect(traiterActes('secret-fictif')).rejects.toThrow()
  expect(annuler).toHaveBeenCalledOnce()
  expect(appel).toBe(3)
})
test('sans authentification aucun traitement ne demarre', async () => {
  const f = vi.fn()
  vi.stubGlobal('fetch', f)
  await expect(traiterActes('')).rejects.toThrow('Authentification absente')
  expect(f).not.toHaveBeenCalled()
})
