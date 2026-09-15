import { beforeEach, expect, test, vi } from 'vitest'
import { GET } from '@/app/(agence)/espace/dossiers/[id]/echeance/route'
const contexte = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: contexte }))
const id = '11111111-1111-4111-8111-111111111111'
const select = vi.fn(),
  eq = vi.fn(),
  gt = vi.fn(),
  lire = vi.fn(),
  from = vi.fn()
const requete = new Request(`https://cloison.test/espace/dossiers/${id}/echeance`)
const appeler = (identifiant = id) => GET(requete, { params: Promise.resolve({ id: identifiant }) })
beforeEach(() => {
  vi.clearAllMocks()
  const chaine = { select, eq, gt, maybeSingle: lire }
  for (const fn of [select, eq, gt, from]) fn.mockReturnValue(chaine)
  contexte.mockResolvedValue({ etat: 'rattache', supabase: { from } })
  lire.mockResolvedValue({
    data: { id, reference: 'REF123456', expire_le: '2099-01-01T00:00:00Z' },
    error: null,
  })
})
test('lecture agence ciblee, projection minimale et fichier sans cache', async () => {
  const resultat = await appeler()
  expect(resultat.status).toBe(200)
  expect(from).toHaveBeenCalledWith('dossiers')
  expect(select).toHaveBeenCalledWith('id, reference, expire_le')
  expect(eq).toHaveBeenCalledWith('id', id)
  expect(gt).toHaveBeenCalledWith('expire_le', expect.any(String))
  expect(resultat.headers.get('cache-control')).toBe('private, no-store')
  expect(resultat.headers.get('content-disposition')).toBe(
    'attachment; filename="echeance-cloison.ics"',
  )
  expect(await resultat.text()).toContain('REF123456')
})
test('UUID invalide refuse avant toute lecture', async () => {
  expect((await appeler('invalide')).status).toBe(404)
  expect(contexte).not.toHaveBeenCalled()
})
test.each(['anonyme', 'non-rattache'])(
  'refuse le contexte %s sans lire de dossier',
  async (etat) => {
    contexte.mockResolvedValue({ etat })
    expect((await appeler()).status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  },
)
test('la redirection MFA du contexte ne devient pas un calendrier ni une erreur metier', async () => {
  const redirection = new Error('redirection MFA fictive')
  contexte.mockRejectedValueOnce(redirection)
  await expect(appeler()).rejects.toBe(redirection)
  expect(from).not.toHaveBeenCalled()
})
test('une ligne masquee par RLS ou absente ne produit aucun fichier', async () => {
  lire.mockResolvedValue({ data: null, error: null })
  const resultat = await appeler()
  expect(resultat.status).toBe(404)
  expect(resultat.headers.get('content-disposition')).toBeNull()
  expect(resultat.headers.get('cache-control')).toBe('private, no-store')
})
test.each([
  { data: null, error: { message: 'SECRET SQL' } },
  { data: { id, reference: 'REF123456', expire_le: 'invalide' }, error: null },
  { data: { id: 'autre', reference: 'REF123456', expire_le: '2099-01-01T00:00:00Z' }, error: null },
])('une panne ou une incoherence ne divulgue pas les donnees brutes', async (retour) => {
  lire.mockResolvedValue(retour)
  const resultat = await appeler()
  expect(resultat.status).toBe(503)
  expect(await resultat.text()).toBe('Échéance indisponible.')
})
