import { createElement, isValidElement, type ReactNode, type ComponentProps } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }))
vi.mock('next/server', () => ({ connection: async () => {} }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: cookies }) }))
vi.mock('@/lib/agences/action-securite', () => ({ seDeconnecter: vi.fn() }))
vi.mock('@/lib/env', () => ({
  env: { emailSupport: null, supabaseUrl: 'https://fixture.supabase.co' },
}))
import LayoutAgence from '@/app/(agence)/layout'
import { CadreEspace } from '@/components/layout/CadreEspace'
import { seDeconnecter } from '@/lib/agences/action-securite'
function formulaires(node: ReactNode): Array<{ action?: unknown }> {
  if (Array.isArray(node)) return node.flatMap(formulaires)
  if (!isValidElement<{ children?: ReactNode; action?: unknown }>(node)) return []
  // Executer le composant reel : lire simplement la prop sortie ferait passer
  // le test meme si le cadre oubliait de la rendre dans sa navigation.
  if (node.type === CadreEspace)
    return formulaires(CadreEspace(node.props as ComponentProps<typeof CadreEspace>))
  return [...(node.type === 'form' ? [node.props] : []), ...formulaires(node.props.children)]
}
beforeEach(() => vi.resetAllMocks())
test('une session agence a un vrai formulaire de deconnexion dans le layout commun', async () => {
  cookies.mockReturnValue([{ name: 'sb-fixture-auth-token.0', value: 'session-fictive' }])
  const rendu = await LayoutAgence({ children: createElement('p', null, 'Espace fictif') })
  expect(formulaires(rendu).filter((f) => f.action === seDeconnecter)).toHaveLength(1)
})
test('un visiteur anonyme ne voit pas de deconnexion', async () => {
  cookies.mockReturnValue([
    { name: 'sb-autre-auth-token', value: 'autre-session' },
    { name: 'sb-fixture-auth-token-code-verifier', value: 'connexion-en-cours' },
  ])
  const rendu = await LayoutAgence({ children: createElement('p', null, 'Connexion') })
  expect(formulaires(rendu).filter((f) => f.action === seDeconnecter)).toHaveLength(0)
})
