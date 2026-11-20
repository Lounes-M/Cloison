import { createElement, isValidElement, type ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }))
vi.mock('next/server', () => ({ connection: async () => {} }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: cookies }) }))
vi.mock('@/lib/agences/action-securite', () => ({ seDeconnecter: vi.fn() }))
vi.mock('@/lib/env', () => ({
  env: { emailSupport: null, supabaseUrl: 'https://fixture.supabase.co' },
}))
import { deplier } from './doublures/deplier'
import LayoutAgence from '@/app/(agence)/layout'
import { CadreEspace } from '@/components/layout/CadreEspace'
import { seDeconnecter } from '@/lib/agences/action-securite'
// Le cadre reel est deplie avant la lecture : lire simplement la prop passee
// ferait reussir le test meme si le cadre oubliait de la rendre.
function formulaires(node: ReactNode): Array<{ action?: unknown }> {
  if (Array.isArray(node)) return node.flatMap(formulaires)
  if (!isValidElement<{ children?: ReactNode; action?: unknown }>(node)) return []
  return [...(node.type === 'form' ? [node.props] : []), ...formulaires(node.props.children)]
}
beforeEach(() => vi.resetAllMocks())
test('une session agence a un vrai formulaire de deconnexion dans le layout commun', async () => {
  cookies.mockReturnValue([{ name: 'sb-fixture-auth-token.0', value: 'session-fictive' }])
  const rendu = await LayoutAgence({ children: createElement('p', null, 'Espace fictif') })
  expect(
    formulaires(await deplier(rendu, [CadreEspace])).filter((f) => f.action === seDeconnecter),
  ).toHaveLength(1)
})
test('un visiteur anonyme ne voit pas de deconnexion', async () => {
  cookies.mockReturnValue([
    { name: 'sb-autre-auth-token', value: 'autre-session' },
    { name: 'sb-fixture-auth-token-code-verifier', value: 'connexion-en-cours' },
  ])
  const rendu = await LayoutAgence({ children: createElement('p', null, 'Connexion') })
  expect(
    formulaires(await deplier(rendu, [CadreEspace])).filter((f) => f.action === seDeconnecter),
  ).toHaveLength(0)
})
