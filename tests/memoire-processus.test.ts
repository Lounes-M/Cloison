import { expect, test } from 'vitest'
import { join } from 'node:path'
import { executerProcessus } from '@/lib/coffre/processus-limite'

const script = join(process.cwd(), 'tests/fixtures/processus.mjs')

test.runIf(process.platform === 'linux')(
  'un decodeur depassant sa memoire native est interrompu',
  async () => {
    await expect(
      executerProcessus(script, Buffer.from('memoire:128'), {
        memoireMax: 96 * 1024 * 1024,
        delai: 6000,
      }),
    ).rejects.toThrow('Memoire documentaire excessive')
    expect(JSON.parse((await executerProcessus(script, Buffer.from('ok'))).toString()).mode).toBe(
      'ok',
    )
  },
)

test.runIf(process.platform === 'linux')('le budget cumule des decodeurs est protege', async () => {
  const resultats = await Promise.allSettled(
    [1, 2].map(() => executerProcessus(script, Buffer.from('memoire:280'), { delai: 6000 })),
  )
  expect(
    resultats.some(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof Error &&
        r.reason.message === 'Budget memoire documentaire depasse',
    ),
  ).toBe(true)
  expect(JSON.parse((await executerProcessus(script, Buffer.from('ok'))).toString()).mode).toBe(
    'ok',
  )
})
