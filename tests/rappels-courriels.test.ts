import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
const d = vi.hoisted(() => ({ sceller: vi.fn(), ouvrir: vi.fn(), envoyer: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/coffre/rotation-maitresse', () => ({
  scellerMaitresse: d.sceller,
  ouvrirMaitresse: d.ouvrir,
}))
vi.mock('@/lib/env', () => ({
  env: {
    emailExpediteur: 'Cloison <test@example.invalid>',
    emailSupport: 'support@example.invalid',
    resendApiKey: 'fictif',
  },
}))
vi.mock('@/lib/courriels/envoi', () => ({ adresseDuSite: () => 'https://example.invalid' }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: d.envoyer }
  },
}))
import { preparerRappels } from '@/lib/courriels/rappels'
import { distribuerCourriels } from '@/lib/courriels/file'
const id = '11111111-1111-4111-8111-111111111111'
const dossier = '22222222-2222-4222-8222-222222222222'
const rappel = {
  id,
  dossier_id: dossier,
  reference: 'ABCD1234',
  nature: 'depot',
  email: 'garant@example.invalid',
  expiration: '2026-09-15T10:00:00+00:00',
}
const db = { rpc: d.rpc } as unknown as SupabaseClient
beforeEach(() => {
  d.sceller.mockReturnValue(Buffer.from('chiffre'))
  d.ouvrir.mockReturnValue(
    Buffer.from(
      JSON.stringify({
        from: 'test@example.invalid',
        to: ['garant@example.invalid'],
        subject: 'Rappel',
        text: 'Texte',
      }),
    ),
  )
  d.envoyer.mockResolvedValue({ data: { id: 'fournisseur-fictif' }, error: null })
  d.rpc.mockImplementation(async (n: string) => ({
    data:
      n === 'programmer_rappels'
        ? 1
        : n === 'rappels_a_preparer'
          ? [rappel]
          : n === 'mettre_rappel_en_file'
            ? 'prepare'
            : n === 'prendre_courriels'
              ? [{ id, bail: dossier, contenu: 'eA==', rappel_id: id }]
              : n === 'confirmer_rappel_avant_envoi'
                ? 'pret'
                : n === 'acquitter_courriel'
                  ? true
                  : 0,
    error: null,
  }))
})
afterEach(() => vi.resetAllMocks())
test('chiffre un rappel sans capacite ni piece et ne livre rien pendant la preparation', async () => {
  expect(await preparerRappels(db)).toEqual({ echecs: 0 })
  const contenu = JSON.parse(d.sceller.mock.calls[0]![0].toString())
  expect(contenu.to).toEqual(['garant@example.invalid'])
  expect(contenu.text).toContain('ABCD1234')
  expect(contenu.text).not.toContain('https://')
  expect(Object.keys(contenu)).toEqual(['from', 'replyTo', 'to', 'subject', 'text'])
  expect(d.rpc).toHaveBeenCalledWith('mettre_rappel_en_file', {
    identifiant: id,
    chiffre: Buffer.from('chiffre').toString('base64'),
  })
  expect(d.envoyer).not.toHaveBeenCalled()
})
test('le rappel agence pointe seulement vers son espace authentifie', async () => {
  d.rpc.mockImplementation(async (n: string) => ({
    data:
      n === 'programmer_rappels'
        ? 1
        : n === 'rappels_a_preparer'
          ? [{ ...rappel, nature: 'echeance' }]
          : 'prepare',
    error: null,
  }))
  await preparerRappels(db)
  expect(JSON.parse(d.sceller.mock.calls[0]![0].toString()).text).toContain(
    `https://example.invalid/espace/dossiers/${dossier}`,
  )
})
test.each([null, -1, 21, 1.5, '1'])('refuse un compte de planification %s', async (data) => {
  d.rpc.mockResolvedValue({ data, error: null })
  await expect(preparerRappels(db)).rejects.toThrow('Planification des rappels indisponible')
  expect(d.sceller).not.toHaveBeenCalled()
})
test.each([
  null,
  [{ ...rappel, email: 'invalide' }],
  [{ ...rappel, nature: 'autre' }],
  Array.from({ length: 21 }, () => rappel),
])('refuse une projection invalide %#', async (data) => {
  d.rpc.mockImplementation(async (n: string) => ({
    data: n === 'programmer_rappels' ? 1 : data,
    error: null,
  }))
  await expect(preparerRappels(db)).rejects.toThrow('Rappels indisponibles')
  expect(d.sceller).not.toHaveBeenCalled()
})
test.each(['obsolete', 'refuse', null])(
  'la confirmation de preparation %s est interpretee strictement',
  async (etat) => {
    d.rpc.mockImplementation(async (n: string) => ({
      data: n === 'programmer_rappels' ? 1 : n === 'rappels_a_preparer' ? [rappel] : etat,
      error: null,
    }))
    expect(await preparerRappels(db)).toEqual({ echecs: etat === 'obsolete' ? 0 : 1 })
  },
)
test('un budget expire empeche de chiffrer et preparer', async () => {
  await expect(preparerRappels(db, AbortSignal.abort())).rejects.toThrow()
  expect(d.sceller).not.toHaveBeenCalled()
})
test.each(['refuse', 'annule', null, false])(
  'une confirmation avant envoi %s empeche tout appel fournisseur',
  async (etat) => {
    const original = d.rpc.getMockImplementation()!
    d.rpc.mockImplementation(async (n: string, ...args: unknown[]) =>
      n === 'confirmer_rappel_avant_envoi' ? { data: etat, error: null } : original(n, ...args),
    )
    expect(await distribuerCourriels(db)).toEqual({ traites: 0, echecs: etat === 'annule' ? 0 : 1 })
    expect(d.envoyer).not.toHaveBeenCalled()
    expect(d.ouvrir).not.toHaveBeenCalled()
    expect(d.rpc.mock.calls.some((c) => c[0] === 'acquitter_courriel')).toBe(false)
  },
)
test('une erreur RPC ne devient jamais un accord de livraison', async () => {
  const original = d.rpc.getMockImplementation()!
  d.rpc.mockImplementation(async (n: string, ...args: unknown[]) =>
    n === 'confirmer_rappel_avant_envoi'
      ? { data: 'pret', error: { message: 'prive' } }
      : original(n, ...args),
  )
  expect(await distribuerCourriels(db)).toEqual({ traites: 0, echecs: 1 })
  expect(d.envoyer).not.toHaveBeenCalled()
})
test('revalide le bail avant le dechiffrement puis acquitte le seul envoi confirme', async () => {
  expect(await distribuerCourriels(db)).toEqual({ traites: 1, echecs: 0 })
  expect(d.rpc).toHaveBeenCalledWith('confirmer_rappel_avant_envoi', {
    identifiant: id,
    le_bail: dossier,
  })
  expect(d.envoyer).toHaveBeenCalledOnce()
  expect(d.rpc).toHaveBeenCalledWith('acquitter_courriel', {
    identifiant: id,
    le_bail: dossier,
    reference_fournisseur: 'fournisseur-fictif',
  })
  const verification = d.rpc.mock.calls.findIndex((c) => c[0] === 'confirmer_rappel_avant_envoi')
  expect(d.rpc.mock.invocationCallOrder[verification]).toBeLessThan(
    d.ouvrir.mock.invocationCallOrder[0]!,
  )
})
