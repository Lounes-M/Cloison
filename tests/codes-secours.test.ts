import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() =>
  Object.fromEntries(
    [
      'user',
      'niveau',
      'liste',
      'status',
      'generate',
      'regenerate',
      'verify',
      'identity',
      'rpc',
      'signOut',
    ].map((k) => [k, vi.fn()]),
  ),
)
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('REDIRECTION')
  },
}))
vi.mock('@/lib/acces/agence', () => ({
  utilisateurCourant: h.user,
  clientAgence: async () => ({
    rpc: h.rpc,
    auth: {
      getUser: h.identity,
      signOut: h.signOut,
      mfa: {
        getAuthenticatorAssuranceLevel: h.niveau,
        listFactors: h.liste,
        recoveryCodes: {
          getStatus: h.status,
          generate: h.generate,
          regenerate: h.regenerate,
          verify: h.verify,
        },
      },
    },
  }),
}))
import { gererCodesSecours, verifierCodeSecours } from '@/lib/agences/action-codes-secours'
import { codesSecours as t } from '@/lib/content/codes-secours'
const id = '11111111-1111-4111-8111-111111111111'
const codes = ['abcdabcdabcdabcd', 'efghefghefghefgh']
const lot = { id, type: 'recovery_code', total: 2, codes }
const status = { id, type: 'recovery_code', total: 2, remaining: 2 }
function form(values: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(values)) f.set(k, v)
  return f
}
const ancien = { message: 'CLIENT', codes: ['SECRET_CLIENT'] }
const generer = () => gererCodesSecours(ancien, form({ operation: 'generer' }))
const verifier = (code = 'ABCD-ABCD ABCD-ABCD') => verifierCodeSecours(ancien, form({ code }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MFA_RECOVERY_CODES_ENABLED', 'true')
  h.user!.mockResolvedValue({ id })
  h.niveau!.mockResolvedValue({ data: { currentLevel: 'aal2' } })
  h.liste!.mockResolvedValue({ data: { all: [], totp: [{ id, status: 'verified' }] } })
  h.status!.mockResolvedValue({ data: status }).mockResolvedValueOnce({
    error: { code: 'mfa_factor_not_found' },
  })
  h.generate!.mockResolvedValue({ data: lot })
  h.regenerate!.mockResolvedValue({ data: lot })
  h.verify!.mockResolvedValue({ error: null })
  h.identity!.mockResolvedValue({ data: { user: { id } } })
  h.rpc!.mockResolvedValue({ data: true })
  h.signOut!.mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())
test('fonction inactive sans appel fournisseur ni ancien secret', async () => {
  vi.stubEnv('MFA_RECOVERY_CODES_ENABLED', 'false')
  expect(await generer()).toEqual({ message: t.indisponible })
  expect(await verifier()).toEqual({ message: t.indisponible })
  expect(h.user).not.toHaveBeenCalled()
})
test.each(['anonyme', 'aal1', 'erreur-niveau', 'sans-facteur', 'erreur-liste'])(
  'generation refusee : %s',
  async (cas) => {
    if (cas === 'anonyme') h.user!.mockResolvedValue(null)
    if (cas === 'aal1') h.niveau!.mockResolvedValue({ data: { currentLevel: 'aal1' } })
    if (cas === 'erreur-niveau') h.niveau!.mockResolvedValue({ error: {} })
    if (cas === 'sans-facteur') h.liste!.mockResolvedValue({ data: { all: [], totp: [] } })
    if (cas === 'erreur-liste') h.liste!.mockResolvedValue({ error: {} })
    expect(await generer()).toEqual({ message: t.erreur })
    expect(h.generate).not.toHaveBeenCalled()
  },
)
test('generation puis verification du lot avant affichage', async () => {
  expect(await generer()).toEqual({ message: t.conserver, codes })
  expect(h.generate).toHaveBeenCalledTimes(1)
})
test.each(['statut', 'existant', 'doublons', 'format', 'total', 'relecture', 'erreur-api'])(
  'aucun secret sur reponse non fiable : %s',
  async (cas) => {
    if (cas === 'statut') h.status!.mockReset().mockResolvedValue({ error: { code: 'network' } })
    if (cas === 'existant') h.status!.mockReset().mockResolvedValue({ data: status })
    if (cas === 'doublons')
      h.generate!.mockResolvedValue({ data: { ...lot, codes: [codes[0], codes[0]] } })
    if (cas === 'format')
      h.generate!.mockResolvedValue({ data: { ...lot, codes: ['<script>', 'x'] } })
    if (cas === 'total') h.generate!.mockResolvedValue({ data: { ...lot, total: 3 } })
    if (cas === 'relecture') h.status!.mockResolvedValue({ data: { ...status, remaining: 1 } })
    if (cas === 'erreur-api') h.generate!.mockResolvedValue({ error: { message: 'DETAIL_PRIVE' } })
    expect(await generer()).toEqual({ message: t.erreur })
  },
)
test.each(['sans-accord', 'autre-facteur', 'correct'])(
  'remplacement controle : %s',
  async (cas) => {
    h.status!.mockReset().mockResolvedValue({ data: status })
    const r = await gererCodesSecours(
      ancien,
      form({
        operation: 'regenerer',
        facteur: cas === 'autre-facteur' ? 'autre' : id,
        accord: cas === 'sans-accord' ? '' : 'on',
      }),
    )
    expect(r).toEqual(cas === 'correct' ? { message: t.conserver, codes } : { message: t.erreur })
    expect(h.regenerate).toHaveBeenCalledTimes(cas === 'correct' ? 1 : 0)
  },
)
function connexion() {
  h.niveau!.mockResolvedValueOnce({ data: { currentLevel: 'aal1' } })
}
test('verification normalisee, revocation SQL et sessions distantes avant redirection', async () => {
  connexion()
  await expect(verifier()).rejects.toThrow('REDIRECTION')
  expect(h.verify).toHaveBeenCalledWith({ code: codes[0] })
  expect(h.rpc).toHaveBeenCalledWith('revoquer_sessions_apres_recuperation')
  expect(h.signOut).toHaveBeenCalledWith({ scope: 'others' })
  expect(h.rpc!.mock.invocationCallOrder[0]).toBeLessThan(h.signOut!.mock.invocationCallOrder[0]!)
})
test.each(['court', 'x'.repeat(129), '<script>abcdefghijk'])(
  'format refuse avant fournisseur : %s',
  async (code) => {
    expect(await verifier(code)).toEqual({ message: t.invalide })
    expect(h.verify).not.toHaveBeenCalled()
  },
)
test.each([
  'anonyme',
  'aal2',
  'limite',
  'code-utilise',
  'identite',
  'niveau',
  'revocation',
  'deconnexion',
  'reseau',
])('aucune redirection apres echec : %s', async (cas) => {
  if (cas !== 'aal2') connexion()
  if (cas === 'anonyme') h.user!.mockResolvedValue(null)
  if (cas === 'limite') h.verify!.mockResolvedValue({ error: { status: 429 } })
  if (cas === 'code-utilise')
    h.verify!.mockResolvedValue({ error: { code: 'mfa_verification_failed' } })
  if (cas === 'identite') h.identity!.mockResolvedValue({ data: { user: { id: 'autre' } } })
  if (cas === 'niveau') h.niveau!.mockResolvedValue({ data: { currentLevel: 'aal1' } })
  if (cas === 'revocation') h.rpc!.mockResolvedValue({ data: false })
  if (cas === 'deconnexion') h.signOut!.mockResolvedValue({ error: {} })
  if (cas === 'reseau') h.verify!.mockRejectedValue(new Error('DETAIL_PRIVE'))
  const r = await verifier()
  expect(r).toEqual({ message: expect.any(String) })
  expect(JSON.stringify(r)).not.toMatch(/SECRET_CLIENT|DETAIL_PRIVE/)
  if (['anonyme', 'aal2', 'limite', 'code-utilise', 'identite', 'niveau'].includes(cas))
    expect(h.rpc).not.toHaveBeenCalled()
  if (cas === 'revocation') expect(h.signOut).not.toHaveBeenCalled()
})
