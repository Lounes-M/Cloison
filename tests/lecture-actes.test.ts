import { randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { telechargerActe } from '@/lib/signature/lecture'
import { empreintePdf, scellerFichierActe } from '@/lib/signature/archive-format'
const h = vi.hoisted(() => ({
  contexte: vi.fn(),
  rpc: vi.fn(),
  lire: vi.fn(),
  ouvrir: vi.fn(),
  porteur: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: h.contexte }))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: h.porteur,
  clientPorteurDeLien: () => ({ rpc: h.rpc }),
}))
vi.mock('@/lib/signature/stockage-actes', () => ({ stockageActe: async () => ({ lire: h.lire }) }))
vi.mock('@/lib/signature/parcours', () => ({ ouvrirContexteActe: h.ouvrir }))
const id = randomUUID(),
  agence = randomUUID(),
  pdf = Buffer.from('%PDF-1.7\nOriginal signe fictif\n%%EOF')
const f = {
  id: randomUUID(),
  acte_id: id,
  nature: 'acte' as const,
  empreinte: empreintePdf(pdf),
  taille: pdf.length,
  nonce: `\\x${randomBytes(12).toString('hex')}`,
  confirme: true,
}
let cle: Buffer
beforeEach(() => {
  vi.resetAllMocks()
  cle = randomBytes(32)
  h.contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { statut: 'verifiee' },
    supabase: { rpc: h.rpc },
  })
  h.ouvrir.mockImplementation(() => ({ cle: Buffer.from(cle) }))
  h.lire.mockResolvedValue(scellerFichierActe(pdf, cle, f))
  h.rpc.mockImplementation(async (n) => ({
    error: null,
    data:
      n === 'journaliser_lecture_acte'
        ? true
        : {
            acte: {
              id,
              agence_id: agence,
              modele: 'recette',
              version_conditions: 1,
              cle_scellee: '\\x00',
              contexte_chiffre: '\\x00',
              etape: 'archive',
              expire_signature: new Date().toISOString(),
              conserver_jusqu_au: new Date().toISOString(),
              document_fournisseur: null,
              signataire_fournisseur: null,
              operation: null,
            },
            demande: {
              id,
              environnement: 'sandbox',
              etat: 'done',
              empreinte_acte: empreintePdf(pdf),
            },
            fichiers: [f],
          },
  }))
})
afterEach(() => cle.fill(0))
test('restitue l original exact sans cache apres journalisation et recontrole', async () => {
  const r = await telechargerActe(new Request('https://example.invalid'), id, 'acte', 'agence')
  expect(r.status).toBe(200)
  expect(Buffer.from(await r.arrayBuffer())).toEqual(pdf)
  expect(r.headers.get('cache-control')).toContain('no-store')
  expect(r.headers.get('content-disposition')).toContain('attachment')
  expect(h.rpc).toHaveBeenCalledWith('journaliser_lecture_acte', { le_id: id })
})
test('une revocation au dernier controle ne restitue aucun octet', async () => {
  const original = h.rpc.getMockImplementation()!
  h.rpc.mockImplementation(async (n, p) =>
    n === 'journaliser_lecture_acte' ? { data: false, error: null } : original(n, p),
  )
  const r = await telechargerActe(new Request('https://example.invalid'), id, 'acte', 'agence')
  expect(r.status).toBe(404)
  expect(await r.text()).toBe('')
})
test('une archive alteree ne restitue aucun octet', async () => {
  h.lire.mockResolvedValue(Buffer.alloc(pdf.length + 16))
  expect(
    (await telechargerActe(new Request('https://example.invalid'), id, 'acte', 'agence')).status,
  ).toBe(404)
})
test.each(['decouverte', 'suspendue'])('une agence %s ne telecharge rien', async (statut) => {
  h.contexte.mockResolvedValue({ etat: 'rattache', agence: { statut }, supabase: { rpc: h.rpc } })
  expect(
    (await telechargerActe(new Request('https://example.invalid'), id, 'acte', 'agence')).status,
  ).toBe(404)
  expect(h.lire).not.toHaveBeenCalled()
})
test('une capacite locataire ne devient jamais une capacite garant', async () => {
  h.porteur.mockResolvedValue({ capacite: { partie: 'locataire' } })
  expect(
    (await telechargerActe(new Request('https://example.invalid'), id, 'acte', 'garant')).status,
  ).toBe(404)
  expect(h.lire).not.toHaveBeenCalled()
})
