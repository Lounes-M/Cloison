import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ contexte: vi.fn(), rpc: vi.fn(), from: vi.fn(), select: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: h.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    throw new Error(p)
  },
}))
import { modifierCollaborateur } from '@/lib/agences/action-collaborateur'
const cible = '20000000-0000-4000-8000-000000000002'
function formulaire() {
  const f = new FormData()
  Object.entries({
    agence: 'agence',
    cible,
    avant: 'membre',
    operation: 'admin',
    confirmation: 'on',
  }).forEach(([k, v]) => f.set(k, v))
  return f
}
beforeEach(() => {
  vi.resetAllMocks()
  const q = {
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: h.select,
  }
  h.from.mockReturnValue(q)
  h.select.mockResolvedValue({ data: [{ utilisateur_id: cible }], error: null })
  h.rpc.mockResolvedValue({ data: true, error: null })
  h.contexte.mockResolvedValue({
    etat: 'rattache',
    role: 'admin',
    utilisateurId: 'administrateur',
    agence: { id: 'agence' },
    supabase: { from: h.from, rpc: h.rpc },
  })
})
test.each(['membre', 'anonyme'])('un %s ne modifie personne', async (role) => {
  h.contexte.mockResolvedValue(
    role === 'anonyme' ? { etat: 'anonyme' } : { etat: 'rattache', role },
  )
  expect((await modifierCollaborateur({}, formulaire())).erreur).toBe(true)
  expect(h.from).not.toHaveBeenCalled()
  expect(h.rpc).not.toHaveBeenCalled()
})
test.each([
  ['agence', 'autre'],
  ['confirmation', ''],
  ['cible', 'invalide'],
  ['avant', 'inconnu'],
  ['operation', 'effacer'],
])('un contexte ou choix invalide %s arrete avant ecriture', async (champ, valeur) => {
  const f = formulaire()
  f.set(champ, valeur)
  expect((await modifierCollaborateur({}, f)).erreur).toBe(true)
  expect(h.from).not.toHaveBeenCalled()
  expect(h.rpc).not.toHaveBeenCalled()
})
test('zero ligne ne produit pas un faux succes', async () => {
  h.select.mockResolvedValue({ data: [], error: null })
  expect((await modifierCollaborateur({}, formulaire())).erreur).toBe(true)
})
test('la readmission exige un oui SQL explicite', async () => {
  const f = formulaire()
  f.set('avant', 'exclu')
  f.set('operation', 'readmettre')
  h.rpc.mockResolvedValue({ data: false, error: null })
  expect((await modifierCollaborateur({}, f)).erreur).toBe(true)
})
test('la promotion confirmee reussit sans exposer les erreurs SQL', async () => {
  expect((await modifierCollaborateur({}, formulaire())).erreur).toBeUndefined()
  h.select.mockResolvedValue({ data: null, error: { code: '23514', message: 'SECRET' } })
  const etat = await modifierCollaborateur({}, formulaire())
  expect(etat.erreur).toBe(true)
  expect(etat.message).not.toContain('SECRET')
})
