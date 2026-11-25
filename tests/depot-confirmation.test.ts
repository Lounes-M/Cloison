import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  deposer: vi.fn(),
  document: vi.fn(),
  contenu: vi.fn(),
  analyse: vi.fn(),
  stockage: vi.fn(),
  statut: vi.fn(),
  prevenir: vi.fn(),
}))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: h.session,
  clientPorteurDeLien: () => ({}),
}))
vi.mock('@/lib/coffre/depot', () => ({ deposer: h.deposer }))
vi.mock('@/lib/coffre/validation-document', () => ({ verifierDocument: h.document }))
vi.mock('@/lib/coffre/type-reel', () => ({ verifierContenu: h.contenu }))
vi.mock('@/lib/garant/debit-depot', () => ({ autoriserAnalyse: h.analyse }))
vi.mock('@/lib/acces/stockage', () => ({ clientStockage: h.stockage }))
vi.mock('@/lib/courriels/notifications', () => ({
  statutActuel: h.statut,
  prevenirSiLeStatutAChange: h.prevenir,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { deposerUnePiece } from '@/lib/garant/action-depot'

const DOSSIER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  h.session.mockResolvedValue({
    jeton: 'fixture',
    capacite: { dossierId: DOSSIER, partie: 'garant' },
  })
  h.analyse.mockResolvedValue(true)
  h.contenu.mockReturnValue({ accepte: true, type: 'application/pdf' })
  h.document.mockResolvedValue(undefined)
  h.stockage.mockResolvedValue({})
  h.statut.mockResolvedValue('ouvert')
  h.prevenir.mockResolvedValue(undefined)
  h.deposer.mockResolvedValue({ depose: true })
})

function formulaire(nature = 'piece_identite') {
  const f = new FormData()
  f.set('dossier', DOSSIER)
  f.set('nature', nature)
  f.set('fichier', new File(['%PDF-1.7\n'], 'essai.pdf', { type: 'application/pdf' }))
  return f
}

test('un depot reussi renvoie vers le message persistant de la piece', async () => {
  await expect(deposerUnePiece({ statut: 'inactif' }, formulaire())).rejects.toThrow(
    'REDIRECT:/garant?deposee=piece_identite#piece-piece_identite',
  )
})

test('une nature inconnue ne redirige pas', async () => {
  const etat = await deposerUnePiece({ statut: 'inactif' }, formulaire('inconnue'))
  expect(etat.statut).toBe('erreur')
  expect(h.deposer).not.toHaveBeenCalled()
})
