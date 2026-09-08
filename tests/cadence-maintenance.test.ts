import { afterEach, expect, test, vi } from 'vitest'
// @ts-expect-error Programme Node autonome.
import { ageMaintenance, verifierCadence } from '../scripts/verifier-cadence.mjs'
const maintenant = Date.parse('2026-09-08T10:00:00Z')
const rapport = (date: string) => ({
  workflow_runs: [{ status: 'completed', conclusion: 'success', run_started_at: date }],
})
afterEach(() => vi.unstubAllGlobals())
test('une maintenance ancienne, absente ou future ne produit pas un faux vert', () => {
  for (const r of [
    rapport('2026-09-08T08:00:00Z'),
    rapport('2026-09-08T11:00:00Z'),
    rapport('invalide'),
    { workflow_runs: [] },
    {},
    rapport('2026-09-08T09:00:00Z'),
  ])
    expect(() => ageMaintenance(r, maintenant)).toThrow()
  expect(ageMaintenance(rapport('2026-09-08T09:40:00Z'), maintenant)).toBe(1200)
})
test('une configuration pouvant sortir de GitHub ne recoit pas le jeton', async () => {
  const appel = vi.fn()
  vi.stubGlobal('fetch', appel)
  await expect(verifierCadence('https://intrus.invalid', 'fixture')).rejects.toThrow()
  expect(appel).not.toHaveBeenCalled()
})
test('une erreur HTTP ne devient pas une maintenance reussie', async () => {
  const appel = vi.fn(async () => new Response('{}', { status: 503 }))
  vi.stubGlobal('fetch', appel)
  await expect(verifierCadence('Lounes-M/Cloison', 'fixture')).rejects.toThrow()
  expect(appel).toHaveBeenCalledWith(
    expect.stringMatching(/^https:\/\/api.github.com\//),
    expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
  )
})
