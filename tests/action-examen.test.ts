import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const doubles = vi.hoisted(() => ({ contexte: vi.fn(), rpc: vi.fn(), revalider: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: doubles.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: doubles.revalider }))
import { enregistrerExamen } from '@/lib/agences/action-examen'
const id = '11111111-1111-4111-8111-111111111111'
function form() {
  const f = new FormData()
  for (const [k, v] of Object.entries({
    dossier: id,
    piece: id,
    revision: '',
    etat: 'examine',
    confirmation: 'on',
  }))
    f.set(k, v)
  return f
}
const enregistrer = (f = form()) => enregistrerExamen({ statut: 'inactif' }, f)
beforeEach(() => {
  doubles.contexte.mockResolvedValue({ etat: 'rattache', supabase: { rpc: doubles.rpc } })
  doubles.rpc.mockResolvedValue({ data: id, error: null })
})
afterEach(() => vi.resetAllMocks())
test.each(['dossier', 'piece', 'revision', 'etat', 'confirmation'])(
  'refuse le champ %s invalide',
  async (champ) => {
    const f = form()
    f.set(champ, 'invalide')
    expect(await enregistrer(f)).toEqual({ statut: 'erreur' })
    expect(doubles.rpc).not.toHaveBeenCalled()
  },
)
test('exige une session rattachee', async () => {
  doubles.contexte.mockResolvedValue({ etat: 'anonyme', supabase: { rpc: doubles.rpc } })
  expect(await enregistrer()).toEqual({ statut: 'erreur' })
  expect(doubles.rpc).not.toHaveBeenCalled()
})
test('transmet la revision et exige la confirmation SQL', async () => {
  const f = form()
  f.set('revision', id)
  expect(await enregistrer(f)).toEqual({ statut: 'enregistre' })
  expect(doubles.rpc).toHaveBeenCalledWith('enregistrer_examen_documentaire', {
    le_dossier: id,
    la_piece: id,
    le_statut: 'examine',
    revision_attendue: id,
  })
  expect(doubles.revalider).toHaveBeenCalledWith(`/espace/dossiers/${id}`)
  doubles.revalider.mockClear()
  for (const data of [null, false, 'ok']) {
    doubles.rpc.mockResolvedValue({ data, error: null })
    expect(await enregistrer()).toEqual({ statut: 'erreur' })
  }
  expect(doubles.revalider).not.toHaveBeenCalled()
})
test('les pannes ne divulguent aucune erreur privee', async () => {
  doubles.rpc.mockResolvedValue({ data: id, error: { message: 'prive' } })
  expect(await enregistrer()).toEqual({ statut: 'erreur' })
  doubles.rpc.mockRejectedValue(new Error('prive'))
  expect(await enregistrer()).toEqual({ statut: 'erreur' })
  expect(doubles.revalider).not.toHaveBeenCalled()
})
