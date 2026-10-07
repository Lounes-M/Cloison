import { afterEach, expect, it, vi } from 'vitest'
const fs = vi.hoisted(() => ({ read: vi.fn(), close: vi.fn(), stat: vi.fn() }))
vi.mock('node:fs/promises', () => ({
  lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
  open: async () => fs,
  rm: vi.fn(),
}))
import { lireBorne } from '../scripts/fichiers-export-prives.mjs'
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})
it.each(['succes', 'lecture', 'depassement', 'fermeture'])(
  'efface les blocs temporaires de lecture : %s',
  async (cas) => {
    const blocs: Buffer[] = []
    fs.stat.mockResolvedValue({ isFile: () => true, size: 3, mode: 0o600 })
    fs.read.mockImplementation(
      async (bloc: Buffer, _offset: number, longueur: number, position: number) => {
        blocs.push(bloc)
        if (position) return { bytesRead: 0 }
        bloc.fill(65)
        if (cas === 'lecture') throw new Error('Lecture refusee')
        return { bytesRead: cas === 'depassement' ? longueur : 3 }
      },
    )
    if (cas === 'fermeture') fs.close.mockRejectedValueOnce(new Error('Fermeture refusee'))
    const concat = vi.spyOn(Buffer, 'concat')
    const operation = lireBorne('fichier-prive', 3)
    if (cas === 'succes') expect(await operation).toEqual(Buffer.from('AAA'))
    else await expect(operation).rejects.toThrow()
    expect(blocs.length).toBeGreaterThan(0)
    for (const bloc of blocs) expect(bloc).toEqual(Buffer.alloc(bloc.length))
    expect(fs.close).toHaveBeenCalledTimes(1)
    if (cas === 'fermeture') {
      expect(concat).toHaveBeenCalledTimes(1)
      expect(concat.mock.results[0]!.value).toEqual(Buffer.alloc(3))
    }
  },
)
