import { afterEach, expect, test, vi } from 'vitest'
import { diagnosticActes, type EtapeDiagnosticActes } from '@/lib/exploitation/diagnostic-actes'
afterEach(() => vi.restoreAllMocks())
test('les messages sont constants, uniques par etape et isoles entre appels', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const signaler = diagnosticActes()
  signaler('archives_suppression')
  signaler('archives_suppression')
  signaler('archives_acquittement')
  expect(log.mock.calls).toEqual([
    ['[actes] echec archives_suppression'],
    ['[actes] echec archives_acquittement'],
  ])
  diagnosticActes()('archives_suppression')
  expect(log).toHaveBeenCalledTimes(3)
})
test('une valeur inconnue ne devient jamais un message de journal', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const signaler = diagnosticActes()
  for (const valeur of [
    'DOCUMENT_PRIVE',
    'Bearer SECRET',
    'archives_suppression\ncontenu prive',
    null,
    { secret: 'PRIVE' },
  ])
    signaler(valeur as EtapeDiagnosticActes)
  expect(log.mock.calls).toEqual([['[actes] echec inconnue']])
})
