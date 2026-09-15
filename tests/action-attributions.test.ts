import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const d = vi.hoisted(() => ({
  contexte: vi.fn(),
  rpc: vi.fn(),
  revalider: vi.fn(),
  executer: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
import { attribuerPlusieurs } from '@/lib/agences/action-attributions'
const ids = [1, 2, 3].map((n) => `${n}`.repeat(8) + '-1111-4111-8111-111111111111')
function form() {
  const f = new FormData()
  f.set('liste', JSON.stringify(ids.map((id) => ({ id, revision: null }))))
  f.set('membre', ids[0]!)
  f.set('confirmation', 'on')
  return f
}
const envoyer = (f = form()) => attribuerPlusieurs({ statut: 'inactif', resultats: [] }, f)
beforeEach(() => {
  d.contexte.mockResolvedValue({
    etat: 'rattache',
    role: 'admin',
    utilisateurId: ids[0],
    supabase: { rpc: d.rpc },
  })
  d.rpc.mockImplementation(() => ({ abortSignal: d.executer }))
  d.executer.mockResolvedValue({ data: ids[0], error: null })
})
afterEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
})
test.each(['liste', 'membre', 'confirmation'])(
  'refuse le champ %s duplique avant tout acces',
  async (champ) => {
    const f = form()
    f.append(champ, f.get(champ) as string)
    expect((await envoyer(f)).statut).toBe('erreur')
    expect(d.contexte).not.toHaveBeenCalled()
  },
)
test.each(
  [
    [],
    Array.from({ length: 21 }, () => ({ id: ids[0], revision: null })),
    [
      { id: ids[0], revision: null },
      { id: ids[0], revision: null },
    ],
    [{ id: ids[0], revision: null, agence: ids[0] }],
    [{ id: ids[0], revision: 'faux' }],
  ].map((liste) => ({ liste })),
)('refuse une selection invalide $liste', async ({ liste }) => {
  const f = form()
  f.set('liste', JSON.stringify(liste))
  expect((await envoyer(f)).statut).toBe('erreur')
  expect(d.rpc).not.toHaveBeenCalled()
})
test('preserve les succes et continue apres un conflit de revision', async () => {
  d.executer
    .mockResolvedValueOnce({ data: ids[0], error: null })
    .mockResolvedValueOnce({ data: null, error: null })
  expect((await envoyer()).resultats.map((r) => r.etat)).toEqual(['confirme', 'refuse', 'confirme'])
  expect(d.rpc).toHaveBeenNthCalledWith(2, 'affecter_dossier', {
    le_dossier: ids[1],
    le_membre: ids[0],
    revision_attendue: null,
  })
})
test.each(['erreur', 'exception', 'reponse-invalide'])(
  'arrete sans repetition apres %s',
  async (panne) => {
    d.executer.mockResolvedValueOnce({ data: ids[0], error: null })
    if (panne === 'exception') d.executer.mockRejectedValueOnce(new Error('prive'))
    else
      d.executer.mockResolvedValueOnce(
        panne === 'erreur'
          ? { data: null, error: { message: 'prive' } }
          : { data: 'invalide', error: null },
      )
    expect((await envoyer()).resultats.map((r) => r.etat)).toEqual([
      'confirme',
      'incertain',
      'non_traite',
    ])
    expect(d.rpc).toHaveBeenCalledTimes(2)
  },
)
test('ne perd pas le bilan si la revalidation echoue', async () => {
  d.revalider.mockImplementation(() => {
    throw new Error('prive')
  })
  expect((await envoyer()).resultats.every((r) => r.etat === 'confirme')).toBe(true)
})
test('une liberation conserve la revision choisie', async () => {
  const f = form()
  f.set('membre', '')
  f.set('liste', JSON.stringify([{ id: ids[0], revision: ids[1] }]))
  await envoyer(f)
  expect(d.rpc).toHaveBeenCalledWith('affecter_dossier', {
    le_dossier: ids[0],
    le_membre: null,
    revision_attendue: ids[1],
  })
})
test.each(['anonyme', 'membre'])('refuse une cible interdite pour %s', async (role) => {
  d.contexte.mockResolvedValue({
    etat: role === 'anonyme' ? 'anonyme' : 'rattache',
    role,
    utilisateurId: ids[1],
    supabase: { rpc: d.rpc },
  })
  expect((await envoyer()).statut).toBe('erreur')
  expect(d.rpc).not.toHaveBeenCalled()
})
test('utilise une seule enveloppe de temps pour toute la selection', async () => {
  await envoyer()
  expect(d.executer.mock.calls[0]![0]).toBeInstanceOf(AbortSignal)
  expect(d.executer.mock.calls[2]![0]).toBe(d.executer.mock.calls[0]![0])
})
