import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { creerEntretienActes } from '@/lib/exploitation/entretien-actes'
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
const panne = { data: null, error: { message: 'SECRET_FICTIF' }, status: 504 }
function fixture() {
  const rpc = vi.fn(async (): Promise<unknown> => ({ data: true, error: null, status: 200 }))
  const controleur = new AbortController()
  const entretien = creerEntretienActes({ rpc } as unknown as SupabaseClient, controleur.signal)
  return { rpc, controleur, entretien }
}
test.each([502, 503, 504])(
  'une passerelle %s autorise une unique reprise de retention',
  async (status) => {
    const { rpc, entretien } = fixture()
    rpc.mockResolvedValueOnce({ ...panne, status })
    expect((await entretien.expirer()).error).toBeNull()
    expect(rpc.mock.calls).toEqual([['expirer_archives_signature'], ['expirer_archives_signature']])
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('SECRET_FICTIF')
  },
)
test('expiration et lecture partagent le quota de reprise', async () => {
  const { rpc, entretien } = fixture()
  rpc.mockResolvedValueOnce(panne)
  await entretien.expirer()
  rpc.mockResolvedValue(panne)
  expect(await entretien.lireFile()).toBe(panne)
  expect(rpc).toHaveBeenCalledTimes(3)
})
test.each([true, false])(
  'la confirmation reprend uniquement le meme bilan %s sans execution metier',
  async (reussite) => {
    const { rpc, entretien } = fixture()
    rpc.mockResolvedValueOnce(panne)
    await entretien.confirmer('archives', reussite)
    expect(rpc.mock.calls).toEqual([
      ['confirmer_traitement_actes', { le_nom: 'archives', reussite }],
      ['confirmer_traitement_actes', { le_nom: 'archives', reussite }],
    ])
  },
)
test('la lecture de cadence peut reprendre sans confirmer un traitement', async () => {
  const { rpc, entretien } = fixture()
  rpc.mockResolvedValueOnce(panne)
  await entretien.lireCadence()
  expect(rpc.mock.calls).toEqual([['etat_traitements_actes'], ['etat_traitements_actes']])
})
test('une passerelle persistante reste en echec apres deux appels', async () => {
  const { rpc, entretien } = fixture()
  rpc.mockResolvedValue(panne)
  expect(await entretien.expirer()).toBe(panne)
  expect(rpc).toHaveBeenCalledTimes(2)
})
test.each([0, 400, 401, 403, 404, 408, 429, 500])(
  'une erreur HTTP %s ne se rejoue pas',
  async (status) => {
    const { rpc, entretien } = fixture()
    rpc.mockResolvedValue({ ...panne, status })
    await entretien.expirer()
    expect(rpc).toHaveBeenCalledTimes(1)
  },
)
test.each(['42501', 'PGRST003', 'PGRST202', '57014', 'CODE_PRIVE', false, {}])(
  'un code structure %j ne se rejoue pas meme avec HTTP 504',
  async (code) => {
    const { rpc, entretien } = fixture()
    rpc.mockResolvedValue({ ...panne, error: { code, message: 'SECRET_FICTIF' } })
    await entretien.expirer()
    expect(rpc).toHaveBeenCalledTimes(1)
    const traces = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(traces).not.toContain('SECRET_FICTIF')
    expect(traces).not.toContain('CODE_PRIVE')
  },
)
test('un resultat faux sans erreur ne devient pas une seconde tentative', async () => {
  const { rpc, entretien } = fixture()
  rpc.mockResolvedValue({ data: false, error: null, status: 200 })
  expect((await entretien.confirmer('signature', true)).data).toBe(false)
  expect(rpc).toHaveBeenCalledTimes(1)
})
test('une exception inconnue reste visible a l appelant sans etre rejouee ni journalisee', async () => {
  const { rpc, entretien } = fixture()
  rpc.mockRejectedValue(new Error('SECRET_FICTIF'))
  await expect(entretien.expirer()).rejects.toThrow()
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    '[actes] transport en echec',
    'expiration',
    'appel_indisponible',
  )
})
test('un budget deja epuise interdit le premier appel', async () => {
  const { rpc, controleur, entretien } = fixture()
  controleur.abort()
  await expect(entretien.expirer()).rejects.toThrow()
  expect(rpc).not.toHaveBeenCalled()
})
test('une interruption pendant l attente interdit la seconde tentative', async () => {
  const { rpc, controleur, entretien } = fixture()
  rpc.mockImplementationOnce(async () => {
    setTimeout(() => controleur.abort(), 20)
    return panne
  })
  await expect(entretien.expirer()).rejects.toThrow()
  expect(rpc).toHaveBeenCalledTimes(1)
})
test('les operations de creation, de paiement et de stockage ne sont pas exposees', () => {
  expect(Object.keys(fixture().entretien).sort()).toEqual([
    'confirmer',
    'expirer',
    'lireCadence',
    'lireFile',
  ])
})
