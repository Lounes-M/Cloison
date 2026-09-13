import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GET } from '@/app/api/maintenance/route'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({ rpc }) }))
vi.mock('@/lib/courriels/notifications', () => ({
  livrerNotifications: async () => ({ echecs: 0 }),
}))
vi.mock('@/lib/courriels/livraison-liens', () => ({ livrerLiens: async () => ({ echecs: 0 }) }))
vi.mock('@/lib/courriels/rappels', () => ({ preparerRappels: async () => ({ echecs: 0 }) }))
vi.mock('@/lib/courriels/file', () => ({
  distribuerCourriels: async () => ({ traites: 0, echecs: 0 }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'fictif')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test.each(['refus', 'exception'])(
  'une reprise en %s laisse les retentions agir sans confirmer la maintenance',
  async (cas) => {
    rpc.mockImplementation(async (nom: string) => {
      if (nom === 'reprendre_depots_inacheves') {
        if (cas === 'exception') throw new Error('DETAIL_PRIVE')
        return { error: { message: 'DETAIL_PRIVE' }, status: 504 }
      }
      return { data: 0, error: null }
    })
    const reponse = await GET(
      new Request('https://example.test/api/maintenance', {
        headers: { authorization: 'Bearer fictif' },
      }),
    )
    expect(reponse.status).toBe(503)
    expect(await reponse.json()).toEqual({
      notifications: { echecs: 0 },
      courriels: { traites: 0, echecs: 0 },
      purge: { traites: 0, echecs: 1 },
    })
    expect(rpc.mock.calls.map(([nom]) => nom)).toEqual([
      'reprendre_depots_inacheves',
      'purger_suivis_droits',
      'purger_historique_responsables',
      'purger_brouillons_engagement',
    ])
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('DETAIL_PRIVE')
  },
)
