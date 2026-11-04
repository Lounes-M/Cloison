import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const d = vi.hoisted(() => ({ contexte: vi.fn(), rpc: vi.fn(), revalider: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
import { relancerLeGarant } from '@/lib/agences/action-relance'
import { relanceGarant as texte } from '@/lib/content/espace'

const id = '11111111-1111-4111-8111-111111111111'
function form(dossier = id) {
  const f = new FormData()
  f.set('dossier', dossier)
  return f
}
const relancer = (f = form()) => relancerLeGarant({ statut: 'inactif' }, f)

beforeEach(() => {
  d.contexte.mockResolvedValue({ etat: 'rattache', supabase: { rpc: d.rpc } })
  d.rpc.mockResolvedValue({ data: true, error: null })
})
afterEach(() => vi.resetAllMocks())

test('refuse un identifiant invalide sans appeler la base', async () => {
  expect(await relancer(form('invalide'))).toEqual({ statut: 'erreur', message: texte.erreur })
  expect(d.rpc).not.toHaveBeenCalled()
})

test('ne relance rien sans session rattachee', async () => {
  d.contexte.mockResolvedValue({ etat: 'anonyme' })
  expect(await relancer()).toEqual({ statut: 'erreur', message: 'Session expirée.' })
  expect(d.rpc).not.toHaveBeenCalled()
})

test('un refus de la base ne revalide rien', async () => {
  const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
  d.rpc.mockResolvedValue({ data: false, error: null })
  expect(await relancer()).toEqual({ statut: 'erreur', message: texte.erreur })
  d.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
  expect(await relancer()).toEqual({ statut: 'erreur', message: texte.erreur })
  expect(erreur).toHaveBeenCalledWith('[agence] relance refusee')
  expect(d.revalider).not.toHaveBeenCalled()
  erreur.mockRestore()
})

test('ouvre un nouveau cycle et rafraichit la fiche et la liste', async () => {
  expect(await relancer()).toEqual({ statut: 'relance' })
  expect(d.rpc).toHaveBeenCalledWith('relancer_garant', { le_dossier: id })
  expect(d.revalider).toHaveBeenCalledWith(`/espace/dossiers/${id}`)
  expect(d.revalider).toHaveBeenCalledWith('/espace')
})
