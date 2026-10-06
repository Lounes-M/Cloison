import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({
  contexte: vi.fn(),
  lire: vi.fn(),
  debit: vi.fn(),
  moteur: vi.fn(),
  config: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: h.contexte }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({}) }))
vi.mock('@/lib/acces/debit', () => ({ consommerDebit: h.debit }))
vi.mock('@/lib/coffre/processus-limite', () => ({ executerProcessus: h.moteur }))
vi.mock('@/lib/signature/configuration-parcours', () => ({ configurationParcours: h.config }))
import { apercevoirActe } from '@/lib/signature/action-apercu'
const id = '11111111-1111-4111-8111-111111111111'
const dossier = () => ({
  id,
  statut: 'transmis',
  expire_le: new Date(Date.now() + 100000).toISOString(),
  demonstration: false,
})
const contexte = () => ({
  etat: 'rattache',
  utilisateurId: id,
  agence: { statut: 'verifiee' },
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.lire }) }) }) },
})
function form() {
  const f = new FormData()
  f.set('dossier', id)
  f.set('page', '1')
  f.set('pdf', new File(['%PDF-1.7 fictif'], 'acte.pdf'))
  return f
}
beforeEach(() => {
  vi.resetAllMocks()
  h.config.mockReturnValue({ mode: 'sandbox' })
  h.contexte.mockResolvedValue(contexte())
  h.lire.mockResolvedValue({ data: dossier(), error: null })
  h.debit.mockResolvedValue(true)
  h.moteur.mockResolvedValue(
    Buffer.from(JSON.stringify({ pages: [{ largeur: 595, hauteur: 842 }], png: 'iVBORw0KGgo=' })),
  )
})
test('controle les droits et les deux budgets avant le moteur', async () => {
  expect((await apercevoirActe(form())).apercu?.page).toBe(1)
  expect(h.debit).toHaveBeenCalledTimes(2)
  expect(h.debit.mock.invocationCallOrder[1]).toBeLessThan(h.moteur.mock.invocationCallOrder[0]!)
  expect(h.moteur.mock.calls[0]![1].toString()).not.toContain(id)
})
test.each(['anonyme', 'non-rattache'])(
  'refuse le contexte %s avant tout traitement',
  async (etat) => {
    h.contexte.mockResolvedValue({ etat })
    expect((await apercevoirActe(form())).apercu).toBeUndefined()
    expect(h.moteur).not.toHaveBeenCalled()
    expect(h.debit).not.toHaveBeenCalled()
  },
)
test.each([
  { id: '22222222-2222-4222-8222-222222222222' },
  { expire_le: '2000-01-01T00:00:00Z' },
  { expire_le: 'invalide' },
  { demonstration: true },
  { statut: 'brouillon' },
])('refuse un dossier inaccessible ou non eligible : %j', async (changement) => {
  h.lire.mockResolvedValue({ data: { ...dossier(), ...changement }, error: null })
  expect((await apercevoirActe(form())).apercu).toBeUndefined()
  expect(h.moteur).not.toHaveBeenCalled()
  expect(h.debit).not.toHaveBeenCalled()
})
test('refuse une agence non verifiee, une lecture en erreur et le parcours ferme', async () => {
  h.contexte.mockResolvedValue({ ...contexte(), agence: { statut: 'decouverte' } })
  expect((await apercevoirActe(form())).apercu).toBeUndefined()
  h.contexte.mockResolvedValue(contexte())
  h.lire.mockResolvedValue({ data: dossier(), error: {} })
  expect((await apercevoirActe(form())).apercu).toBeUndefined()
  h.config.mockReturnValue(null)
  expect((await apercevoirActe(form())).apercu).toBeUndefined()
  expect(h.moteur).not.toHaveBeenCalled()
})
test('un budget refuse ou indisponible interdit le rendu', async () => {
  h.debit.mockResolvedValueOnce(false)
  expect((await apercevoirActe(form())).apercu).toBeUndefined()
  h.debit.mockRejectedValue(new Error('detail prive'))
  expect(JSON.stringify(await apercevoirActe(form()))).not.toContain('detail prive')
  expect(h.moteur).not.toHaveBeenCalled()
})
test('ne transmet jamais une sortie moteur invalide', async () => {
  for (const sortie of [
    {},
    { pages: [], png: 'PHN2Zz4=' },
    { pages: [{ largeur: 595, hauteur: 842 }], png: 'PHN2Zz48L3N2Zz4=' },
  ]) {
    h.moteur.mockResolvedValue(Buffer.from(JSON.stringify(sortie)))
    expect((await apercevoirActe(form())).apercu).toBeUndefined()
  }
})
