import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('@/lib/coffre/enveloppe', () => ({
  ouvrir: () =>
    Buffer.from(
      JSON.stringify({
        from: 'source@example.invalid',
        to: ['destinataire@example.invalid'],
        subject: 'Essai local',
        text: 'Contenu fictif',
      }),
    ),
}))
vi.mock('@/lib/coffre/cle-maitresse', () => ({ cleMaitresse: () => Buffer.alloc(32) }))
vi.mock('@/lib/env', () => ({ env: { resendApiKey: 'fixture' } }))
import { distribuerCourriels } from '@/lib/courriels/file'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('un transport sans reponse est annule puis repris avec la meme cle Resend', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const cles: (string | null)[] = []
  let annule = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options: RequestInit) => {
      cles.push(new Headers(options.headers).get('Idempotency-Key'))
      if (cles.length === 1) {
        expect(options.signal).toBeInstanceOf(AbortSignal)
        await new Promise<void>((_resolve, reject) => {
          options.signal!.addEventListener(
            'abort',
            () => {
              annule = true
              reject(new Error('Delai fictif'))
            },
            { once: true },
          )
        })
      }
      return new Response(JSON.stringify({ id: 'courriel-fictif' }), { status: 200 })
    }),
  )
  const rpc = vi.fn(async (nom: string) => ({
    data:
      nom === 'prendre_courriels'
        ? [{ id: '11111111-1111-4111-8111-111111111111', contenu: '', bail: 'bail-fictif' }]
        : nom === 'etat_file_courriels'
          ? 0
          : nom === 'acquitter_courriel'
            ? true
            : null,
    error: null,
  }))
  const db = { rpc } as unknown as SupabaseClient
  expect(await distribuerCourriels(db)).toEqual({ traites: 0, echecs: 1 })
  expect(annule).toBe(true)
  expect(rpc).toHaveBeenCalledWith(
    'acquitter_courriel',
    expect.objectContaining({ reference_fournisseur: null }),
  )
  expect(await distribuerCourriels(db)).toEqual({ traites: 1, echecs: 0 })
  expect(cles).toEqual([
    'courriel/11111111-1111-4111-8111-111111111111',
    'courriel/11111111-1111-4111-8111-111111111111',
  ])
}, 5_000)
