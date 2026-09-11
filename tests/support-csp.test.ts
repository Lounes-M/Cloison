import { afterEach, expect, test, vi } from 'vitest'
afterEach(() => vi.restoreAllMocks())
test('la preparation client ne tente aucune compilation de code interdite par la CSP', async () => {
  const construire = vi.spyOn(globalThis, 'Function').mockImplementation(function () {
    throw new EvalError('CSP fictive')
  })
  const { preparerMessageSupport } = await import('@/lib/support/message')
  expect(
    preparerMessageSupport({
      adresse: 'support@example.invalid',
      reference: 'ABC12345',
      espace: 'garant',
      categorie: 'depot',
    }),
  ).not.toBeNull()
  expect(construire).not.toHaveBeenCalled()
})
