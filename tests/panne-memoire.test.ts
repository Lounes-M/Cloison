import { afterEach, expect, test, vi } from 'vitest'
import { join } from 'node:path'
const { lire } = vi.hoisted(() => ({ lire: vi.fn() }))
vi.mock('@/lib/coffre/memoire-processus', () => ({ lireMemoireProcessus: lire }))
import { executerProcessus } from '@/lib/coffre/processus-limite'

const script = join(process.cwd(), 'tests/fixtures/processus.mjs')
afterEach(() => {
  vi.unstubAllGlobals()
  lire.mockReset()
})

test('une perte de mesure arrete le decodeur et libere son slot apres fermeture', async () => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  lire.mockResolvedValueOnce(48 * 1024 * 1024).mockRejectedValue(new Error('detail-prive'))
  await expect(executerProcessus(script, Buffer.from('bloque'), { delai: 2000 })).rejects.toThrow(
    /^Mesure memoire indisponible$/,
  )
  lire.mockReset().mockResolvedValue(48 * 1024 * 1024)
  expect(JSON.parse((await executerProcessus(script, Buffer.from('ok'))).toString()).mode).toBe(
    'ok',
  )
})

test('une mesure absente des le depart refuse le traitement', async () => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  lire.mockRejectedValue(new Error('detail-prive'))
  await expect(executerProcessus(script, Buffer.from('ok'))).rejects.toThrow(
    /^Mesure memoire indisponible$/,
  )
})

test('une mesure tardive ne recree pas le budget d un enfant ferme', async () => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  let terminerMesure!: (rss: number) => void
  lire.mockImplementationOnce(
    () =>
      new Promise<number>((resolve) => {
        terminerMesure = resolve
      }),
  )
  await expect(executerProcessus(script, Buffer.from('ok'), { delai: 200 })).rejects.toThrow(
    'Document trop long a traiter',
  )
  terminerMesure(700 * 1024 * 1024)
  await new Promise((resolve) => setImmediate(resolve))
  lire.mockResolvedValue(48 * 1024 * 1024)
  expect(JSON.parse((await executerProcessus(script, Buffer.from('ok'))).toString()).mode).toBe(
    'ok',
  )
})

test.each([0, -1, NaN, Infinity, 512 * 1024 * 1024])(
  'la limite %s ne peut pas desactiver le controle',
  async (memoireMax) => {
    await expect(executerProcessus(script, Buffer.from('ok'), { memoireMax })).rejects.toThrow(
      'Limite memoire invalide',
    )
    expect(lire).not.toHaveBeenCalled()
  },
)
