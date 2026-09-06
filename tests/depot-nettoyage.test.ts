import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import { baseSupabase } from '@/lib/coffre/depot-supabase'

test('le rattrapage ne supprime jamais des octets sur une seule reponse HTTP', async () => {
  const remove = vi.fn(async () => ({ error: null }))
  const rpc = vi.fn(async () => ({ error: null }))
  const client = { rpc, storage: { from: () => ({ remove }) } } as unknown as SupabaseClient
  await baseSupabase(client).retirerObjet('dossier/objet')
  expect(remove).not.toHaveBeenCalled()
  expect(rpc).toHaveBeenCalledExactlyOnceWith('programmer_suppression_objet', {
    le_chemin: 'dossier/objet',
  })
})
