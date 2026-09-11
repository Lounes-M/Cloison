import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const d = vi.hoisted(() => ({ contexte: vi.fn(), rpc: vi.fn(), revalider: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
import { reglerRappels } from '@/lib/agences/action-rappels'
const id = '11111111-1111-4111-8111-111111111111'
function form() {
  const f = new FormData()
  f.set('relance', '3')
  f.set('echeance', '7')
  f.set('revision', '')
  f.set('confirmation', 'on')
  return f
}
const envoyer = (f = form()) => reglerRappels({ statut: 'inactif' }, f)
beforeEach(() => {
  d.contexte.mockResolvedValue({ etat: 'rattache', role: 'admin', supabase: { rpc: d.rpc } })
  d.rpc.mockResolvedValue({ data: id, error: null })
})
afterEach(() => vi.resetAllMocks())
test.each(['relance', 'echeance', 'revision', 'confirmation'])(
  'refuse %s invalide',
  async (champ) => {
    const f = form()
    f.set(champ, 'invalide')
    expect(await envoyer(f)).toEqual({ statut: 'erreur' })
    expect(d.rpc).not.toHaveBeenCalled()
  },
)
test.each([
  { etat: 'anonyme', role: 'admin' },
  { etat: 'rattache', role: 'membre' },
])('refuse le contexte %j', async (c) => {
  d.contexte.mockResolvedValue({ ...c, supabase: { rpc: d.rpc } })
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  expect(d.rpc).not.toHaveBeenCalled()
})
test('transmet seulement les delais et la revision, jamais une agence cliente', async () => {
  const f = form()
  f.set('revision', id)
  f.set('agence_id', 'autre')
  expect(await envoyer(f)).toEqual({ statut: 'enregistre' })
  expect(d.rpc).toHaveBeenCalledWith('regler_rappels', {
    relance: 3,
    echeance: 7,
    revision_attendue: id,
  })
  expect(d.revalider).toHaveBeenCalledWith('/espace/rappels')
})
test('la premiere revision est nulle', async () => {
  await envoyer()
  expect(d.rpc).toHaveBeenCalledWith('regler_rappels', {
    relance: 3,
    echeance: 7,
    revision_attendue: null,
  })
})
test.each([null, false, 'ok'])('une confirmation %s ne devient pas un succes', async (data) => {
  d.rpc.mockResolvedValue({ data, error: null })
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  expect(d.revalider).not.toHaveBeenCalled()
})
test('les pannes ne divulguent pas leur contenu', async () => {
  d.rpc.mockResolvedValue({ data: id, error: { message: 'prive' } })
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  d.rpc.mockRejectedValue(new Error('prive'))
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  expect(d.revalider).not.toHaveBeenCalled()
})
