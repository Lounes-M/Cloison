import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const d = vi.hoisted(() => ({ contexte: vi.fn(), rpc: vi.fn(), revalider: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
import { affecterDossier } from '@/lib/agences/action-responsable'
const id = '11111111-1111-4111-8111-111111111111',
  autre = '22222222-2222-4222-8222-222222222222'
function form() {
  const f = new FormData()
  for (const [k, v] of Object.entries({
    dossier: id,
    membre: id,
    revision: '',
    confirmation: 'on',
  }))
    f.set(k, v)
  return f
}
const envoyer = (f = form()) => affecterDossier({ statut: 'inactif' }, f)
beforeEach(() => {
  d.contexte.mockResolvedValue({
    etat: 'rattache',
    role: 'admin',
    utilisateurId: id,
    supabase: { rpc: d.rpc },
  })
  d.rpc.mockResolvedValue({ data: autre, error: null })
})
afterEach(() => vi.resetAllMocks())
test.each(['dossier', 'membre', 'revision', 'confirmation'])(
  'refuse un champ %s invalide',
  async (champ) => {
    const f = form()
    f.set(champ, 'invalide')
    expect(await envoyer(f)).toEqual({ statut: 'erreur' })
    expect(d.rpc).not.toHaveBeenCalled()
  },
)
test('ne traite aucune affectation sans session', async () => {
  d.contexte.mockResolvedValue({
    etat: 'anonyme',
    role: 'admin',
    utilisateurId: id,
    supabase: { rpc: d.rpc },
  })
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  expect(d.rpc).not.toHaveBeenCalled()
})
test('un membre ne peut pas affecter le dossier a un collegue', async () => {
  d.contexte.mockResolvedValue({
    etat: 'rattache',
    role: 'membre',
    utilisateurId: autre,
    supabase: { rpc: d.rpc },
  })
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  expect(d.rpc).not.toHaveBeenCalled()
})
test('une liberation transmet une cible nulle et sa revision', async () => {
  const f = form()
  f.set('membre', '')
  f.set('revision', id)
  expect(await envoyer(f)).toEqual({ statut: 'enregistre' })
  expect(d.rpc).toHaveBeenCalledWith('affecter_dossier', {
    le_dossier: id,
    le_membre: null,
    revision_attendue: id,
  })
  expect(d.revalider).toHaveBeenCalledWith('/espace')
  expect(d.revalider).toHaveBeenCalledWith(`/espace/dossiers/${id}`)
})
test('un conflit SQL ne produit pas de faux succes', async () => {
  for (const data of [null, false, 'ok']) {
    d.rpc.mockResolvedValue({ data, error: null })
    expect(await envoyer()).toEqual({ statut: 'erreur' })
  }
  expect(d.revalider).not.toHaveBeenCalled()
})
test('les pannes restent privees', async () => {
  d.rpc.mockResolvedValue({ data: id, error: { message: 'prive' } })
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  d.rpc.mockRejectedValue(new Error('prive'))
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  expect(d.revalider).not.toHaveBeenCalled()
})
