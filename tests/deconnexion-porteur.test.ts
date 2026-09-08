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
  expect(set).toHaveBeenCalledExactlyOnceWith(
    'cloison_capacite',
    '',
    expect.objectContaining({ path: '/', maxAge: 0, httpOnly: true }),
  )
})
