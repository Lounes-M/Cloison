import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const doubles = vi.hoisted(() => ({ contexte: vi.fn(), rpc: vi.fn(), revalider: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: doubles.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: doubles.revalider }))
import { gererConnecteur } from '@/lib/connecteurs/action'
import { empreinteConnecteur } from '@/lib/connecteurs/cles'
const id = '11111111-1111-4111-8111-111111111111'
const form = (operation = 'creer') => {
  const f = new FormData()
  f.set('agence', id)
  f.set('confirmation', 'on')
  f.set('nom', 'Logiciel fictif')
  f.set('id', id)
  f.set('operation', operation)
  return f
}
beforeEach(() => {
  doubles.contexte.mockResolvedValue({
    etat: 'rattache',
    role: 'admin',
    agence: { id },
    supabase: { rpc: doubles.rpc },
  })
  doubles.rpc.mockResolvedValue({ data: id, error: null })
})
afterEach(() => vi.resetAllMocks())
test.each([{ etat: 'anonyme' }, { etat: 'rattache', role: 'membre', agence: { id } }])(
  'ne cree pas de cle sans administrateur',
  async (c) => {
    doubles.contexte.mockResolvedValue({ ...c, supabase: { rpc: doubles.rpc } })
    expect(await gererConnecteur(form())).toEqual({ ok: false })
    expect(doubles.rpc).not.toHaveBeenCalled()
  },
)
test.each(['agence', 'confirmation', 'nom', 'operation'])(
  'refuse un champ %s incorrect',
  async (champ) => {
    const f = form()
    f.set(champ, '')
    expect(await gererConnecteur(f)).toEqual({ ok: false })
    expect(doubles.rpc).not.toHaveBeenCalled()
  },
)
test('ne retourne la cle privee qu apres confirmation SQL', async () => {
  const resultat = await gererConnecteur(form())
  expect(resultat.ok).toBe(true)
  expect(resultat.cle).toMatch(/^cloison_read_[A-Za-z0-9_-]{43}$/)
  expect(doubles.rpc).toHaveBeenCalledWith('creer_connecteur', {
    le_nom: 'Logiciel fictif',
    l_empreinte: empreinteConnecteur(resultat.cle!),
  })
  expect(JSON.stringify(doubles.rpc.mock.calls)).not.toContain(resultat.cle)
  doubles.rpc.mockResolvedValue({ data: null, error: null })
  expect(await gererConnecteur(form())).toEqual({ ok: false })
  doubles.rpc.mockResolvedValue({ data: id, error: { message: 'prive' } })
  expect(await gererConnecteur(form())).toEqual({ ok: false })
})
test('confirme la revocation seulement si SQL retourne vrai', async () => {
  doubles.rpc.mockResolvedValue({ data: false, error: null })
  expect(await gererConnecteur(form('revoquer'))).toEqual({ ok: false })
  doubles.rpc.mockResolvedValue({ data: true, error: null })
  expect(await gererConnecteur(form('revoquer'))).toEqual({ ok: true })
  expect(doubles.rpc).toHaveBeenLastCalledWith('revoquer_connecteur', { le_connecteur: id })
})
test('une erreur ne revele aucun detail prive', async () => {
  doubles.rpc.mockRejectedValue(new Error('secret-prive'))
  expect(await gererConnecteur(form())).toEqual({ ok: false })
})
