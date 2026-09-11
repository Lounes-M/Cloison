import { beforeEach, expect, test, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
const h = vi.hoisted(() => ({
  user: vi.fn(),
  niveau: vi.fn(),
  facteurs: vi.fn(),
  challenge: vi.fn(),
}))
vi.mock('@/lib/acces/agence', () => ({
  utilisateurCourant: h.user,
  clientAgence: async () => ({
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: h.niveau,
        listFactors: h.facteurs,
        challengeAndVerify: h.challenge,
      },
    },
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/components/forms/FormulaireSecurite', () => ({ FormulaireSecurite: () => null }))
import Page from '@/app/(agence)/connexion/securite/page'
import { FormulaireSecurite } from '@/components/forms/FormulaireSecurite'
import { verifierSecondFacteur } from '@/lib/agences/action-securite'
import { securite } from '@/lib/content/securite'
function elements(node: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [{ type: node.type, props: node.props }, ...elements(node.props.children)]
}
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  vi.resetAllMocks()
  h.user.mockResolvedValue({ id: a })
  h.niveau.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null })
  h.facteurs.mockResolvedValue({
    data: {
      totp: [
        { id: a, status: 'verified', friendly_name: 'Principal' },
        { id: b, status: 'verified', friendly_name: '<script>Secours</script>' },
        { id: 'non-verifie', status: 'unverified' },
      ],
    },
    error: null,
  })
})
test('la page propose les deux facteurs verifies et aucun facteur en attente', async () => {
  const form = elements(await Page()).find((e) => e.type === FormulaireSecurite)
  expect(form?.props.facteurs).toEqual([
    { id: a, nom: 'Application 1 : Principal' },
    { id: b, nom: 'Application 2 : <script>Secours</script>' },
  ])
  expect(form?.props.initial).toEqual({ facteur: a })
})
test.each(['erreur', 'exception'])(
  'une panne de liste ne propose pas un nouvel enrôlement : %s',
  async (cas) => {
    if (cas === 'erreur') h.facteurs.mockResolvedValue({ data: { totp: [] }, error: {} })
    else h.facteurs.mockRejectedValue(new Error('Fournisseur indisponible'))
    const nodes = elements(await Page())
    expect(nodes.some((e) => e.type === FormulaireSecurite)).toBe(false)
    expect(nodes.some((e) => e.props.role === 'alert')).toBe(true)
    expect(nodes.some((e) => e.type === 'a' && e.props.href === '/connexion/securite')).toBe(true)
  },
)
test.each(['erreur', 'exception', 'absence'])(
  'une assurance indisponible ferme la configuration : %s',
  async (cas) => {
    if (cas === 'exception') h.niveau.mockRejectedValue(new Error('Fournisseur indisponible'))
    else
      h.niveau.mockResolvedValue({
        data: cas === 'absence' ? null : { currentLevel: 'aal1' },
        error: cas === 'erreur' ? {} : null,
      })
    const nodes = elements(await Page())
    expect(nodes.some((e) => e.type === FormulaireSecurite)).toBe(false)
    expect(h.facteurs).not.toHaveBeenCalled()
  },
)
test('un compte sans facteur peut encore configurer son application', async () => {
  h.facteurs.mockResolvedValue({ data: { totp: [] }, error: null })
  const form = elements(await Page()).find((e) => e.type === FormulaireSecurite)
  expect(form?.props.facteurs).toEqual([])
  expect(form?.props.initial).toEqual({ facteur: undefined })
})
test('une session deja verifiee rejoint son espace sans lecture inutile', async () => {
  h.niveau.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null })
  await expect(Page()).rejects.toThrow('REDIRECT:/espace')
  expect(h.facteurs).not.toHaveBeenCalled()
})
test('un visiteur ne peut consulter les facteurs', async () => {
  h.user.mockResolvedValue(null)
  await expect(Page()).rejects.toThrow('REDIRECT:/connexion')
  expect(h.niveau).not.toHaveBeenCalled()
  expect(h.facteurs).not.toHaveBeenCalled()
})

test('une verification refusee retourne le facteur choisi pour la reprise du formulaire', async () => {
  h.challenge.mockResolvedValue({ error: { message: 'Erreur privee fournisseur' } })
  const f = new FormData()
  f.set('facteur', b)
  f.set('code', '123456')
  const etat = await verifierSecondFacteur({ facteur: a }, f)
  expect(etat).toEqual({ facteur: b, erreur: securite.erreur })
  expect(h.challenge).toHaveBeenCalledExactlyOnceWith({ factorId: b, code: '123456' })
})

test('les noms vides ou longs restent identifiables sans afficher une valeur illimitee', () => {
  expect(securite.nomFacteur(2, '   ')).toBe('Application 2')
  expect(securite.nomFacteur(2)).toBe('Application 2')
  expect(securite.nomFacteur(2, 'x'.repeat(100))).toBe('Application 2 : ' + 'x'.repeat(80))
})
