import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, test, vi } from 'vitest'
import { purgerRemises } from '@/lib/exploitation/purge-remises'
afterEach(() => vi.restoreAllMocks())
test.each(['succes', 'retrait', 'acquittement', 'exception', 'file', 'budget'])(
  'purge et reprise : %s',
  async (cas) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = randomUUID(),
      autre = randomUUID()
    const rpc = vi.fn(async (nom: string) => {
      if (nom === 'remises_droits_a_purger')
        return { data: cas === 'file' ? ['../pieces'] : [id, autre], error: null }
      return { data: cas !== 'acquittement', error: null }
    })
    const remove = vi.fn(async ([chemin]: string[]) => {
      if (chemin === id && cas === 'exception') throw new Error('secret-fictif')
      return { error: chemin === id && cas === 'retrait' ? { message: 'secret-fictif' } : null }
    })
    const from = vi.fn(() => ({ remove }))
    const c = new AbortController()
    if (cas === 'budget') c.abort()
    const r = await purgerRemises({ rpc, storage: { from } } as unknown as SupabaseClient, c.signal)
    expect(r).toEqual(
      cas === 'succes'
        ? { traites: 2, echecs: 0 }
        : cas === 'acquittement'
          ? { traites: 0, echecs: 2 }
          : ['file', 'budget'].includes(cas)
            ? { traites: 0, echecs: 1 }
            : { traites: 1, echecs: 1 },
    )
    if (['retrait', 'exception'].includes(cas))
      expect(rpc).not.toHaveBeenCalledWith('acquitter_remise_droits', { le_chemin: id })
    if (['file', 'budget'].includes(cas)) expect(remove).not.toHaveBeenCalled()
    else expect(from).toHaveBeenCalledWith('exports-droits')
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-fictif')
  },
)
