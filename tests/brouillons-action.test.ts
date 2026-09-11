import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ capacite: vi.fn(), rpc: vi.fn(), cle: vi.fn(), lireCle: vi.fn() }))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: h.capacite,
  clientPorteurDeLien: () => ({ rpc: h.rpc }),
}))
vi.mock('@/lib/coffre/depot', () => ({ cleDuDossier: h.cle }))
vi.mock('@/lib/coffre/depot-supabase', () => ({
  baseSupabase: () => ({}),
  lireCleScellee: h.lireCle,
  versBytea: (b: Buffer) => '\\x' + b.toString('hex'),
  depuisBytea: (b: string) => Buffer.from(b.slice(2), 'hex'),
}))
vi.mock('@/lib/coffre/rotation-maitresse', () => ({ ouvrirMaitresse: (b: Buffer) => b }))
import { gererBrouillon } from '@/lib/brouillons/action'
import { chiffrerBrouillon, dechiffrerBrouillon } from '@/lib/brouillons/format'
const id = '11111111-1111-4111-8111-111111111111',
  rev = '22222222-2222-4222-8222-222222222222',
  cle = Buffer.alloc(32, 1)
const saisie = {
  profil: 'salarie' as const,
  couvre: 'loyer' as const,
  montant: '1200',
  revenu: '',
  jusquAu: '',
  solidaire: false,
}
function form(operation = 'sauver') {
  const f = new FormData()
  f.set('dossier', id)
  f.set('versionConditions', '0')
  f.set('brouillonRevision', '')
  f.set('brouillonOperation', operation)
  for (const [k, v] of Object.entries(saisie)) if (k !== 'solidaire') f.set(k, String(v))
  return f
}
beforeEach(() => {
  vi.resetAllMocks()
  h.capacite.mockResolvedValue({ capacite: { dossierId: id, partie: 'garant' }, jeton: 'fictif' })
  h.cle.mockResolvedValue(cle)
  h.lireCle.mockResolvedValue(cle)
  h.rpc.mockResolvedValue({ data: rev, error: null })
})
test('sauvegarde seulement le contenu chiffre avec contexte', async () => {
  expect(await gererBrouillon({}, form())).toHaveProperty('revision', rev)
  const [nom, args] = h.rpc.mock.calls[0]!
  expect(nom).toBe('sauver_brouillon_engagement')
  expect(dechiffrerBrouillon(Buffer.from(args.le_chiffre.slice(2), 'hex'), id, 0, cle)).toEqual(
    saisie,
  )
  expect(args.revision_attendue).toBeNull()
})
test.each(['anonyme', 'locataire', 'dossier', 'revision', 'version', 'taille', 'operation'])(
  'refuse avant stockage : %s',
  async (cas) => {
    const f = form()
    if (cas === 'anonyme') h.capacite.mockResolvedValue(null)
    if (cas === 'locataire')
      h.capacite.mockResolvedValue({ capacite: { dossierId: id, partie: 'locataire' } })
    if (cas === 'dossier') f.set('dossier', rev)
    if (cas === 'revision') f.set('brouillonRevision', 'invalide')
    if (cas === 'version') f.set('versionConditions', '-1')
    if (cas === 'taille') f.set('revenu', 'x'.repeat(33))
    if (cas === 'operation') f.set('brouillonOperation', 'publier')
    expect(await gererBrouillon({}, f)).toHaveProperty('erreur')
    expect(h.rpc).not.toHaveBeenCalled()
  },
)
test.each([null, [], {}, 'invalide'])('pas de succes sur confirmation invalide', async (data) => {
  h.rpc.mockResolvedValue({ data, error: null })
  expect(await gererBrouillon({}, form())).toHaveProperty('erreur')
})
test('suppression revisionnee sans acces a la cle', async () => {
  const f = form('supprimer')
  f.set('brouillonRevision', rev)
  expect(await gererBrouillon({}, f)).toHaveProperty('revision', rev)
  expect(h.cle).not.toHaveBeenCalled()
  expect(h.rpc).toHaveBeenCalledWith('sauver_brouillon_engagement', {
    le_chiffre: null,
    la_version: 0,
    revision_attendue: rev,
  })
})
function ligne() {
  return {
    revision: rev,
    version_conditions: 0,
    chiffre: '\\x' + chiffrerBrouillon(saisie, id, 0, cle).toString('hex'),
    expire_le: '2026-09-18T12:00:00Z',
  }
}
test('lecture et revalidation avant restitution', async () => {
  h.rpc.mockResolvedValue({ data: [ligne()], error: null })
  expect(await gererBrouillon({}, form('lire'))).toHaveProperty('saisie', saisie)
  expect(h.rpc).toHaveBeenCalledTimes(2)
})
test.each(['disparu', 'conflit', 'tiers', 'cle', 'panne'])(
  'lecture refusee sans divulgation : %s',
  async (cas) => {
    const b = ligne()
    if (cas === 'tiers') b.chiffre = '\\x' + chiffrerBrouillon(saisie, rev, 0, cle).toString('hex')
    h.rpc
      .mockResolvedValueOnce({ data: [b], error: null })
      .mockResolvedValue({ data: cas === 'disparu' ? [] : [{ ...b, revision: id }], error: null })
    if (cas === 'cle') h.lireCle.mockResolvedValue(null)
    if (cas === 'panne') h.rpc.mockRejectedValue(new Error('DETAIL_PRIVE'))
    const r = await gererBrouillon({}, form('lire'))
    expect(r).toHaveProperty('erreur')
    expect(r.saisie).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain('DETAIL_PRIVE')
  },
)
