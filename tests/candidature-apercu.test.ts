import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({ rpc: h.rpc }) }))

import { generateMetadata } from '@/app/(marketing)/candidater/[code]/page'

const CODE = 'c'.repeat(32)
const avec = (code: string) => generateMetadata({ params: Promise.resolve({ code }) })

beforeEach(() => {
  h.rpc.mockReset()
})

test('l apercu partage nomme le bien et l agence, sans indexation', async () => {
  h.rpc.mockResolvedValue({
    data: [{ libelle: 'T2 Gerland', loyer_cents: 78000, agence: 'Logis Lyon' }],
    error: null,
  })
  const meta = await avec(CODE)
  expect(meta.title).toBe('T2 Gerland, avec Logis Lyon')
  expect(meta.openGraph?.title).toBe('T2 Gerland, avec Logis Lyon')
  expect(String(meta.description)).toContain('Logis Lyon')
  expect(meta.robots).toEqual({ index: false, follow: false })
  expect(h.rpc).toHaveBeenCalledWith('logement_par_code', { le_code: CODE })
})

test('un lien ferme ou mal forme ne dit rien du bien', async () => {
  h.rpc.mockResolvedValue({ data: [], error: null })
  expect((await avec(CODE)).title).toBe('Ce lien ne fonctionne plus')
  h.rpc.mockClear()
  expect((await avec('pas-un-code')).openGraph).toBeUndefined()
  expect(h.rpc).not.toHaveBeenCalled()
})
