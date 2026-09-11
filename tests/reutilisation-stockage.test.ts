import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: h.create }))
vi.mock('@/lib/env', () => ({
  env: {
    supabaseJwtSecret: 'secret-fictif-test-local-uniquement',
    supabaseUrl: 'http://localhost:1',
    supabasePublishableKey: 'fictif',
  },
}))
import { jwtVerify } from 'jose'
import { clientStockage } from '@/lib/acces/stockage'
const cible = {
  dossierId: '11111111-1111-4111-8111-111111111111',
  partie: 'garant' as const,
  jti: '22222222-2222-4222-8222-222222222222',
}
const source = { ...cible, dossierId: '33333333-3333-4333-8333-333333333333' }
beforeEach(() => vi.resetAllMocks())
test('atteste source et destination avec signature et expiration courte', async () => {
  await clientStockage(cible, { source, piece: source.dossierId, empreinte: 'a'.repeat(64) })
  const auth = h.create.mock.calls[0]![2].global.headers.Authorization
  const { payload: p } = await jwtVerify(
    auth.slice(7),
    new TextEncoder().encode('secret-fictif-test-local-uniquement'),
  )
  expect(p).toMatchObject({
    role: 'depot_piece',
    dossier_id: cible.dossierId,
    jti: cible.jti,
    copie_dossier: source.dossierId,
    copie_jti: source.jti,
    copie_piece: source.dossierId,
    copie_version: 'copie-v1',
  })
  expect(p.exp! - p.iat!).toBe(300)
})
test('un depot ordinaire ne porte aucune autorisation de copie', async () => {
  await clientStockage(cible)
  const auth = h.create.mock.calls[0]![2].global.headers.Authorization
  const { payload: p } = await jwtVerify(
    auth.slice(7),
    new TextEncoder().encode('secret-fictif-test-local-uniquement'),
  )
  expect(p.copie_version).toBeUndefined()
})
test.each(['role', 'meme', 'jti', 'piece', 'empreinte'])(
  'refuse une attestation invalide : %s',
  async (cas) => {
    const copie = { source: { ...source }, piece: source.dossierId, empreinte: 'a'.repeat(64) }
    if (cas === 'role') Object.assign(copie.source, { partie: 'locataire' })
    if (cas === 'meme') copie.source.dossierId = cible.dossierId
    if (cas === 'jti') copie.source.jti = 'faux'
    if (cas === 'piece') copie.piece = '../'
    if (cas === 'empreinte') copie.empreinte = 'clair'
    await expect(clientStockage(cible, copie)).rejects.toThrow('Copie non autorisee')
    expect(h.create).not.toHaveBeenCalled()
  },
)
