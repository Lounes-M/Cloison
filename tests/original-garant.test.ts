import { beforeEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
const h = vi.hoisted(() => ({ journal: vi.fn(), cle: vi.fn(), meta: vi.fn(), download: vi.fn() }))
vi.mock('@/lib/coffre/depot-supabase', () => ({
  SEAU: 'pieces',
  inscrireAuJournal: h.journal,
  lireCleScellee: h.cle,
}))
vi.mock('@/lib/coffre/cle-maitresse', () => ({ cleMaitresse: () => Buffer.alloc(32, 1) }))
import { lireOriginalGarant } from '@/lib/garant/original'
import { sceller } from '@/lib/coffre/enveloppe'
import { scellerAvecTrousseau } from '@/lib/coffre/rotation-format'
const dossier = '11111111-1111-4111-8111-111111111111',
  piece = '22222222-2222-4222-8222-222222222222',
  capacite = { dossierId: dossier, partie: 'garant' as const, jti: dossier },
  cle = Buffer.alloc(32, 3),
  contenu = Buffer.from('document fictif')
const meta = {
  id: piece,
  dossier_id: dossier,
  chemin: dossier + '/' + piece,
  type: 'piece_identite',
  type_reel: 'application/pdf',
  taille_octets: contenu.length,
  nombre_documents: 1,
  depose_le: '2026-09-11T10:00:00Z',
}
const q = { select: () => q, eq: () => q, maybeSingle: h.meta }
const db = {
  from: () => q,
  storage: { from: () => ({ download: h.download }) },
} as unknown as SupabaseClient
beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  h.meta
    .mockResolvedValueOnce({ data: meta, error: null })
    .mockResolvedValue({ data: { id: piece }, error: null })
  h.journal.mockResolvedValue(true)
  h.cle.mockResolvedValue(sceller(cle, Buffer.alloc(32, 1)))
  h.download.mockResolvedValue({
    data: new Blob([new Uint8Array(sceller(contenu, cle))]),
    error: null,
  })
})
test.each(['historique', 'active', 'lecture'])(
  'lit les octets avec une enveloppe %s',
  async (cas) => {
    if (cas !== 'historique') {
      const active = Buffer.alloc(32, 2)
      h.cle.mockResolvedValue(
        scellerAvecTrousseau(cle, { historique: Buffer.alloc(32, 1), active, lecture: [] }),
      )
      if (cas === 'active') vi.stubEnv('CLE_MAITRESSE_ACTIVE', active.toString('base64'))
      else vi.stubEnv('CLES_MAITRESSES_LECTURE', JSON.stringify([active.toString('base64')]))
    }
    expect((await lireOriginalGarant(db, capacite, piece))?.contenu).toEqual(contenu)
  },
)
test.each(['role', 'id', 'tiers', 'journal', 'taille', 'retiree', 'objet'])(
  'aucune restitution : %s',
  async (cas) => {
    if (cas === 'tiers')
      h.meta.mockReset().mockResolvedValue({ data: { ...meta, dossier_id: piece }, error: null })
    if (cas === 'journal') h.journal.mockResolvedValue(false)
    if (cas === 'taille')
      h.meta.mockReset().mockResolvedValue({ data: { ...meta, taille_octets: 99 }, error: null })
    if (cas === 'retiree')
      h.meta
        .mockReset()
        .mockResolvedValueOnce({ data: meta, error: null })
        .mockResolvedValue({ data: null, error: null })
    if (cas === 'objet') h.download.mockResolvedValue({ data: null, error: {} })
    expect(
      await lireOriginalGarant(
        db,
        cas === 'role' ? { ...capacite, partie: 'locataire' } : capacite,
        cas === 'id' ? '../secret' : piece,
      ),
    ).toBeNull()
  },
)
