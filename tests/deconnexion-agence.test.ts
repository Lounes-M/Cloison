import { format } from 'node:util'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const { agence, signOut, magasin } = vi.hoisted(() => ({
  agence: vi.fn(),
  signOut: vi.fn(),
  magasin: { getAll: vi.fn(), set: vi.fn() },
}))
vi.mock('@/lib/acces/agence', () => ({ clientAgence: agence, utilisateurCourant: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => magasin }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECTION:${path}`)
  },
}))
vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://fixture.supabase.co' } }))
import { seDeconnecter } from '@/lib/agences/action-securite'
const NOM = 'sb-fixture-auth-token'
const PRIVE = 'secret-fixture@example.invalid'
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  agence.mockResolvedValue({ auth: { signOut } })
  signOut.mockResolvedValue({ error: null })
  magasin.getAll.mockReturnValue([
    { name: NOM, value: PRIVE },
    { name: NOM + '.0', value: PRIVE },
    { name: NOM + '.1', value: PRIVE },
    { name: NOM + '-code-verifier', value: PRIVE },
    { name: NOM + '-user', value: PRIVE },
    { name: 'cloison_capacite', value: 'autre-role' },
    { name: 'sb-autre-auth-token', value: 'autre-projet' },
  ])
})
afterEach(() => vi.restoreAllMocks())
for (const panne of ['aucune', 'refus', 'exception', 'client']) {
  test(`la deconnexion ${panne} efface les cookies agence sans toucher les autres roles`, async () => {
    if (panne === 'refus') signOut.mockResolvedValue({ error: new Error(PRIVE) })
    if (panne === 'exception') signOut.mockRejectedValue(new Error(PRIVE))
    if (panne === 'client') agence.mockRejectedValue(new Error(PRIVE))
    await expect(seDeconnecter()).rejects.toThrow('REDIRECTION:/connexion')
    const effaces = magasin.set.mock.calls.map(([nom]) => nom)
    expect(effaces.sort()).toEqual(
      [NOM, NOM + '.0', NOM + '.1', NOM + '-code-verifier', NOM + '-user'].sort(),
    )
    for (const [, valeur, options] of magasin.set.mock.calls) {
      expect(valeur).toBe('')
      expect(options).toMatchObject({ path: '/', maxAge: 0 })
    }
    const traces = vi
      .mocked(console.error)
      .mock.calls.map((args) => format(...args))
      .join('\n')
    expect(traces).not.toContain(PRIVE)
    if (panne === 'aucune') expect(console.error).not.toHaveBeenCalled()
    else
      expect(console.error).toHaveBeenCalledExactlyOnceWith(
        '[connexion] revocation distante non confirmee',
      )
    if (panne !== 'client') expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  })
}
