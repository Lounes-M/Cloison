import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { purgerCoffres } from '@/lib/exploitation/purge'
import { creerObservateurPurge } from '@/lib/exploitation/reprise-purge'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
const passerelle = { data: null, error: { message: 'secret-fictif' }, status: 504 }
function fixture() {
  const rpc = vi.fn(async (_nom: string): Promise<unknown> => ({ data: 0, error: null }))
  const file = vi.fn(async (): Promise<unknown> => ({ data: [], error: null }))
  const db = {
    rpc,
    from: () => ({ select: () => ({ order: () => ({ limit: file }) }) }),
  } as unknown as SupabaseClient
  return { rpc, file, db, signal: new AbortController().signal }
}

test.each([502, 503, 504])('reprend une passerelle HTTP %s une seule fois', async (status) => {
  const { db, rpc, signal } = fixture()
  rpc.mockResolvedValueOnce({ ...passerelle, status })
  expect(await purgerCoffres(db, signal)).toEqual({ traites: 0, echecs: 0 })
  expect(rpc.mock.calls.filter(([nom]) => nom === 'reprendre_depots_inacheves')).toHaveLength(2)
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-fictif')
})

test('le quota de reprise est partage par toutes les etapes de purge', async () => {
  const { db, rpc, signal } = fixture()
  rpc.mockResolvedValueOnce(passerelle)
  rpc.mockImplementation(async (nom) =>
    nom === 'purger_suivis_droits' ? passerelle : { data: 0, error: null },
  )
  expect(await purgerCoffres(db, signal)).toEqual({ traites: 0, echecs: 1 })
  expect(rpc.mock.calls.filter(([nom]) => nom === 'reprendre_depots_inacheves')).toHaveLength(2)
  expect(rpc.mock.calls.filter(([nom]) => nom === 'purger_suivis_droits')).toHaveLength(1)
})

test('une passerelle persistante conserve un echec et arrete la chaine documentaire', async () => {
  const { db, rpc, file, signal } = fixture()
  rpc.mockImplementation(async (nom) =>
    nom === 'reprendre_depots_inacheves' ? passerelle : { data: 0, error: null },
  )
  expect(await purgerCoffres(db, signal)).toEqual({ traites: 0, echecs: 1 })
  expect(rpc.mock.calls.filter(([nom]) => nom === 'reprendre_depots_inacheves')).toHaveLength(2)
  expect(file).not.toHaveBeenCalled()
})

test('reprend aussi la lecture de file et conserve les retentions', async () => {
  const { db, file, signal } = fixture()
  file.mockResolvedValueOnce(passerelle)
  expect(await purgerCoffres(db, signal)).toEqual({ traites: 0, echecs: 0 })
  expect(file).toHaveBeenCalledTimes(2)
})

test.each([400, 401, 403, 404, 408, 429, 500])(
  'ne rejoue pas une erreur HTTP %s',
  async (status) => {
    const { db, rpc, signal } = fixture()
    rpc.mockResolvedValueOnce({ ...passerelle, status })
    expect((await purgerCoffres(db, signal)).echecs).toBe(1)
    expect(rpc.mock.calls.filter(([nom]) => nom === 'reprendre_depots_inacheves')).toHaveLength(1)
  },
)

test.each(['42501', 'PGRST003', '57014'])('ne rejoue pas le refus SQL %s', async (code) => {
  const { db, rpc, signal } = fixture()
  rpc.mockResolvedValueOnce({ ...passerelle, error: { code } })
  expect((await purgerCoffres(db, signal)).echecs).toBe(1)
  expect(rpc.mock.calls.filter(([nom]) => nom === 'reprendre_depots_inacheves')).toHaveLength(1)
})

test('sans budget interruptible aucune reprise nest activee', async () => {
  const { db, rpc } = fixture()
  rpc.mockResolvedValueOnce(passerelle)
  expect((await purgerCoffres(db)).echecs).toBe(1)
  expect(rpc.mock.calls.filter(([nom]) => nom === 'reprendre_depots_inacheves')).toHaveLength(1)
})

test('une interruption pendant lattente interdit la reprise et les appels suivants', async () => {
  const { db, rpc } = fixture()
  const controleur = new AbortController()
  rpc.mockImplementationOnce(async () => {
    setTimeout(() => controleur.abort(), 20)
    return passerelle
  })
  expect(await purgerCoffres(db, controleur.signal)).toEqual({ traites: 0, echecs: 4 })
  expect(rpc).toHaveBeenCalledTimes(1)
})

test.each(['retrait', 'acquittement'] as const)('ne rejoue jamais %s', async (etape) => {
  const appel = vi.fn(async () => passerelle)
  expect(await creerObservateurPurge(new AbortController().signal)(etape, appel)).toBe(passerelle)
  expect(appel).toHaveBeenCalledTimes(1)
})

test('une exception inconnue nest pas rejouee', async () => {
  const appel = vi.fn(async () => {
    throw new Error('secret-fictif')
  })
  await expect(
    creerObservateurPurge(new AbortController().signal)('reprise', appel),
  ).rejects.toThrow()
  expect(appel).toHaveBeenCalledTimes(1)
})
