import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const d = vi.hoisted(() => ({
  contexte: vi.fn(),
  rpc: vi.fn(),
  revalider: vi.fn(),
  envoyer: vi.fn(),
  serveur: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
vi.mock('@/lib/courriels/envoi', () => ({ envoyer: d.envoyer }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: d.serveur }))
import { cloreLeDossier } from '@/lib/agences/action-cloture'
import { cloture as courriels } from '@/lib/content/courriels'
import { cloture as texte } from '@/lib/content/espace'

const id = '11111111-1111-4111-8111-111111111111'
function form(valeurs: Record<string, string> = {}) {
  const f = new FormData()
  for (const [k, v] of Object.entries({ dossier: id, reference: 'CL-ABC123', ...valeurs }))
    f.set(k, v)
  return f
}
const clore = (f = form()) => cloreLeDossier({ statut: 'inactif' }, f)

beforeEach(() => {
  d.contexte.mockResolvedValue({ etat: 'rattache', supabase: { rpc: d.rpc } })
  d.rpc.mockResolvedValue({
    data: {
      reference: 'CL-ABC123',
      email_locataire: 'locataire@example.invalid',
      email_garant: 'garant@example.invalid',
    },
    error: null,
  })
  d.serveur.mockResolvedValue({ serveur: true })
  d.envoyer.mockResolvedValue(true)
})
afterEach(() => vi.resetAllMocks())

test.each<Record<string, string>>([
  { dossier: 'invalide' },
  { reference: '' },
  { reference: 'x'.repeat(65) },
])('refuse un formulaire invalide sans appeler la base', async (valeurs) => {
  expect(await clore(form(valeurs))).toEqual({ statut: 'erreur', message: texte.erreur })
  expect(d.rpc).not.toHaveBeenCalled()
  expect(d.envoyer).not.toHaveBeenCalled()
})

test('ne clot rien sans session rattachee', async () => {
  d.contexte.mockResolvedValue({ etat: 'anonyme' })
  expect(await clore()).toEqual({ statut: 'erreur', message: 'Session expirée.' })
  expect(d.rpc).not.toHaveBeenCalled()
})

test("un refus de la base n'envoie aucun courriel", async () => {
  d.rpc.mockResolvedValue({ data: null, error: null })
  expect(await clore()).toEqual({ statut: 'erreur', message: texte.erreur })
  d.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
  expect(await clore()).toEqual({ statut: 'erreur', message: texte.erreur })
  expect(d.envoyer).not.toHaveBeenCalled()
  expect(d.revalider).not.toHaveBeenCalled()
})

test('une cloture previent le locataire et le garant avec des identites stables', async () => {
  expect(await clore(form({ reference: '  CL-ABC123 ' }))).toEqual({
    statut: 'clos',
    reference: 'CL-ABC123',
  })
  expect(d.rpc).toHaveBeenCalledWith('clore_dossier', {
    le_dossier: id,
    la_reference: 'CL-ABC123',
  })
  expect(d.envoyer).toHaveBeenCalledTimes(2)
  const [locataire, garant] = d.envoyer.mock.calls
  expect(locataire![0]).toBe('locataire@example.invalid')
  expect(locataire![1]).toBe(courriels.locataire.sujet)
  expect(garant![0]).toBe('garant@example.invalid')
  expect(garant![1]).toBe(courriels.garant.sujet)
  for (const appel of [locataire!, garant!]) {
    expect(appel[2]).toContain('CL-ABC123')
    expect(appel[2]).not.toMatch(/https?:\/\//)
    expect(appel[3]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(appel[5]).toBe(true)
  }
  expect(locataire![3]).not.toBe(garant![3])
  d.envoyer.mockClear()
  await clore()
  expect(d.envoyer.mock.calls.map((a) => a[3])).toEqual([locataire![3], garant![3]])
  expect(d.revalider).toHaveBeenCalledWith('/espace')
})

test("sans garant designe, seul le locataire est prevenu ; un echec d'envoi ne defait pas la cloture", async () => {
  d.rpc.mockResolvedValue({
    data: {
      reference: 'CL-ABC123',
      email_locataire: 'locataire@example.invalid',
      email_garant: null,
    },
    error: null,
  })
  d.envoyer.mockResolvedValue(false)
  expect(await clore()).toEqual({ statut: 'clos', reference: 'CL-ABC123' })
  expect(d.envoyer).toHaveBeenCalledTimes(1)
  d.serveur.mockRejectedValue(new Error('panne'))
  expect(await clore()).toEqual({ statut: 'clos', reference: 'CL-ABC123' })
})
