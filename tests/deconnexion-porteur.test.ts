import { expect, test, vi } from 'vitest'
const { set } = vi.hoisted(() => ({ set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECTION:${url}`)
  },
}))
import { quitterMonDossier } from '@/lib/acces/action-porteur'
test('quitter retire seulement la capacite du navigateur, pas la session agence', async () => {
  await expect(quitterMonDossier()).rejects.toThrow('REDIRECTION:/demarrer')
  expect(set).toHaveBeenCalledWith(
    'cloison_capacite',
    '',
    expect.objectContaining({ path: '/', maxAge: 0, httpOnly: true }),
  )
  // Avec lui, les autres dossiers gardes dans ce navigateur, et rien d'autre.
  expect(
    set.mock.calls.map(([a]) => (typeof a === 'string' ? a : (a as { name: string }).name)),
  ).toEqual(['cloison_capacite', 'cloison_autre_1', 'cloison_autre_2', 'cloison_autre_3'])
})
