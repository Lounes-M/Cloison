import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const d = vi.hoisted(() => ({ contexte: vi.fn(), rpc: vi.fn(), revalider: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
import { reglerNotifications } from '@/lib/agences/action-preferences'
const id = '11111111-1111-4111-8111-111111111111'
function form() {
  const f = new FormData()
  f.set('mode', 'mes')
  f.set('revision', '')
  f.set('confirmation', 'on')
  return f
}
const envoyer = (f = form()) => reglerNotifications({ statut: 'inactif' }, f)
beforeEach(() => {
  d.contexte.mockResolvedValue({ etat: 'rattache', supabase: { rpc: d.rpc } })
  d.rpc.mockResolvedValue({ data: id, error: null })
})
afterEach(() => vi.resetAllMocks())
test.each(['mode', 'revision', 'confirmation'])('refuse le champ %s invalide', async (champ) => {
  const f = form()
  f.set(champ, 'invalide')
  expect(await envoyer(f)).toEqual({ statut: 'erreur' })
  expect(d.rpc).not.toHaveBeenCalled()
})
test('refuse une session non rattachee', async () => {
  d.contexte.mockResolvedValue({ etat: 'anonyme', supabase: { rpc: d.rpc } })
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  expect(d.rpc).not.toHaveBeenCalled()
})
test('transmet la revision sans identifiant de destinataire fourni par le client', async () => {
  const f = form()
  f.set('revision', id)
  f.set('utilisateur_id', 'un-autre')
  expect(await envoyer(f)).toEqual({ statut: 'enregistre' })
  expect(d.rpc).toHaveBeenCalledWith('regler_notifications', {
    le_mode: 'mes',
    revision_attendue: id,
  })
  expect(d.revalider).toHaveBeenCalledWith('/espace/notifications')
})
test('transmet une premiere revision nulle', async () => {
  await envoyer()
  expect(d.rpc).toHaveBeenCalledWith('regler_notifications', {
    le_mode: 'mes',
    revision_attendue: null,
  })
})
test('aucun faux succes en cas de conflit SQL', async () => {
  for (const data of [null, false, 'ok']) {
    d.rpc.mockResolvedValue({ data, error: null })
    expect(await envoyer()).toEqual({ statut: 'erreur' })
  }
  expect(d.revalider).not.toHaveBeenCalled()
})
test('les erreurs de fournisseur restent privees', async () => {
  d.rpc.mockResolvedValue({ data: id, error: { message: 'prive' } })
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  d.rpc.mockRejectedValue(new Error('prive'))
  expect(await envoyer()).toEqual({ statut: 'erreur' })
  expect(d.revalider).not.toHaveBeenCalled()
})
