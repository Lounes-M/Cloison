import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({
  capacite: vi.fn(),
  source: vi.fn(),
  liste: vi.fn(),
  confirmation: vi.fn(),
  lire: vi.fn(),
  deposer: vi.fn(),
  stockage: vi.fn(),
  debit: vi.fn(),
  statut: vi.fn(),
  notifier: vi.fn(),
  verifier: vi.fn(),
}))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: h.capacite,
  resoudreCapacite: h.source,
  clientPorteurDeLien: (jeton: string) => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        lte: () => q,
        order: () => q,
        limit: h.liste,
        maybeSingle: jeton === 'cible' ? h.confirmation : vi.fn(),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/acces/stockage', () => ({ clientStockage: h.stockage }))
vi.mock('@/lib/coffre/depot', () => ({ deposer: h.deposer }))
vi.mock('@/lib/coffre/depot-supabase', () => ({ baseSupabase: () => ({}) }))
vi.mock('@/lib/garant/original', () => ({ lireOriginalGarant: h.lire }))
vi.mock('@/lib/garant/debit-depot', () => ({ autoriserAnalyse: h.debit }))
vi.mock('@/lib/coffre/validation-document', () => ({ verifierDocument: h.verifier }))
vi.mock('@/lib/courriels/notifications', () => ({
  statutActuel: h.statut,
  prevenirSiLeStatutAChange: h.notifier,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { createHash } from 'node:crypto'
import { site } from '@/lib/site'
import { copierPiece, listerPiecesReutilisables } from '@/lib/garant/action-reutilisation'
const cible = '11111111-1111-4111-8111-111111111111',
  source = '22222222-2222-4222-8222-222222222222',
  piece = '33333333-3333-4333-8333-333333333333'
const contenu = Buffer.from('fictif'),
  empreinte = createHash('sha256').update(contenu).digest('hex')
function form() {
  const f = new FormData()
  f.set('dossier', cible)
  f.set('lien_source', site.url + '/lien/aaa.bbb.ccc')
  f.set('piece', piece)
  f.set('consentement', 'copie-v1')
  return f
}
beforeEach(() => {
  vi.resetAllMocks()
  h.capacite.mockResolvedValue({
    capacite: { dossierId: cible, partie: 'garant', jti: cible },
    jeton: 'cible',
  })
  h.source.mockResolvedValue({ dossierId: source, partie: 'garant', jti: source })
  h.debit.mockResolvedValue(true)
  h.statut.mockResolvedValue('ouvert')
  h.lire.mockResolvedValue({
    contenu,
    nature: 'piece_identite',
    nombre: 1,
    typeReel: 'application/pdf',
  })
  h.deposer.mockResolvedValue({ depose: true })
  h.confirmation
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValue({ data: { piece_id: piece, empreinte_original: empreinte }, error: null })
})
test('copie seulement apres accord, validation et attestation de provenance', async () => {
  expect(await copierPiece(form())).toEqual({ statut: 'copie' })
  expect(h.stockage).toHaveBeenCalledWith(expect.objectContaining({ dossierId: cible }), {
    source: expect.objectContaining({ dossierId: source }),
    piece,
    empreinte,
  })
  expect(h.deposer).toHaveBeenCalledWith({}, cible, 'piece_identite', contenu, 1)
  expect(h.verifier).toHaveBeenCalledWith(contenu, 'application/pdf')
})
test.each([
  'consentement',
  'piece',
  'dossier',
  'locataire-cible',
  'locataire-source',
  'meme',
  'revoque',
  'lien-externe',
  'debit',
  'ferme',
  'original',
])('refuse avant copie : %s', async (cas) => {
  const f = form()
  if (cas === 'consentement') f.delete('consentement')
  if (cas === 'piece') f.set('piece', '../secret')
  if (cas === 'dossier') f.set('dossier', source)
  if (cas === 'locataire-cible')
    h.capacite.mockResolvedValue({ capacite: { dossierId: cible, partie: 'locataire' } })
  if (cas === 'locataire-source')
    h.source.mockResolvedValue({ dossierId: source, partie: 'locataire', jti: source })
  if (cas === 'meme')
    h.source.mockResolvedValue({ dossierId: cible, partie: 'garant', jti: source })
  if (cas === 'revoque') h.source.mockResolvedValue(null)
  if (cas === 'lien-externe') f.set('lien_source', 'https://tiers.invalid/lien/aaa.bbb.ccc')
  if (cas === 'debit') h.debit.mockResolvedValue(false)
  if (cas === 'ferme') h.statut.mockResolvedValue('transmis')
  if (cas === 'original') h.lire.mockResolvedValue(null)
  expect(await copierPiece(f)).toHaveProperty('statut', 'erreur')
  expect(h.deposer).not.toHaveBeenCalled()
})
test('pas de deuxieme depot si la copie est deja confirmee', async () => {
  h.confirmation
    .mockReset()
    .mockResolvedValue({ data: { piece_id: piece, empreinte_original: empreinte }, error: null })
  expect(await copierPiece(form())).toEqual({ statut: 'copie' })
  expect(h.deposer).not.toHaveBeenCalled()
})
test('reponse perdue reconciliee par provenance', async () => {
  h.deposer.mockResolvedValue({ depose: false })
  expect(await copierPiece(form())).toEqual({ statut: 'copie' })
})
test('aucun succes si la confirmation manque', async () => {
  h.confirmation.mockReset().mockResolvedValue({ data: null, error: null })
  expect(await copierPiece(form())).toHaveProperty('statut', 'erreur')
})
test('panne constante sans details prives', async () => {
  h.lire.mockRejectedValue(new Error('JETON_PRIVE'))
  const r = await copierPiece(form())
  expect(r).toHaveProperty('statut', 'erreur')
  expect(JSON.stringify(r)).not.toContain('JETON_PRIVE')
})
test('liste minimale sans lecture des octets', async () => {
  h.liste.mockResolvedValue({
    data: [
      {
        id: piece,
        type: 'piece_identite',
        depose_le: '2026-09-10T10:00:00Z',
        taille_octets: 10,
        chemin: 'prive',
      },
    ],
    error: null,
  })
  expect(await listerPiecesReutilisables(form())).toEqual({
    statut: 'liste',
    pieces: [{ id: piece, nature: 'piece_identite', date: '2026-09-10T10:00:00Z', taille: 10 }],
  })
  expect(h.lire).not.toHaveBeenCalled()
})
