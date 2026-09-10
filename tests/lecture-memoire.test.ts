import { afterEach, expect, test, vi } from 'vitest'
const { lire } = vi.hoisted(() => ({ lire: vi.fn() }))
vi.mock('node:fs/promises', () => ({ readFile: lire }))
import { lireMemoireProcessus } from '@/lib/coffre/memoire-processus'

afterEach(() => {
  lire.mockReset()
  vi.restoreAllMocks()
})

test('la mesure du noyau est convertie en octets, sans lire les donnees du processus', async () => {
  lire.mockResolvedValue('Name:\tfixture\nState:\tR (running)\nVmRSS:\t 12345 kB\n')
  expect(await lireMemoireProcessus(123)).toBe(12345 * 1024)
  expect(lire).toHaveBeenCalledWith('/proc/123/status', 'utf8')
})

test.each(['', 'VmRSS: 0 kB', 'VmRSS: 1 MB', 'VmRSS: -1 kB', 'VmRSS: 9007199254740991 kB'])(
  'une mesure invalide %s est refusee',
  async (statut) => {
    lire.mockResolvedValue(statut)
    await expect(lireMemoireProcessus(123)).rejects.toThrow('Mesure memoire indisponible')
  },
)

test.each([0, -1, NaN, Infinity, 1.5])(
  'un PID invalide %s ne devient pas un chemin',
  async (pid) => {
    await expect(lireMemoireProcessus(pid)).rejects.toThrow('Mesure memoire indisponible')
    expect(lire).not.toHaveBeenCalled()
  },
)

test('une disparition confirmee ou un zombie ne simule pas une panne de mesure', async () => {
  lire.mockResolvedValueOnce('State:\tZ (zombie)\n')
  expect(await lireMemoireProcessus(123)).toBeNull()
  lire.mockRejectedValueOnce(Object.assign(new Error('chemin-prive'), { code: 'ENOENT' }))
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error(), { code: 'ESRCH' })
  })
  expect(await lireMemoireProcessus(123)).toBeNull()
})

test('un processus vivant sans mesure disponible est refuse sans fuite', async () => {
  const tuer = vi.spyOn(process, 'kill').mockReturnValue(true)
  for (const code of ['ENOENT', 'EACCES']) {
    lire.mockRejectedValueOnce(Object.assign(new Error('chemin-prive'), { code }))
    await expect(lireMemoireProcessus(123)).rejects.toThrow(/^Mesure memoire indisponible$/)
  }
  expect(tuer).toHaveBeenCalledWith(123, 0)
})
