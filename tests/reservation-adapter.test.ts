import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import { baseSupabase } from '@/lib/coffre/depot-supabase'
import { purgerCoffres } from '@/lib/exploitation/purge'

test('un upload ne commence pas sans reservation durable', async () => {
  const upload = vi.fn(async () => ({ error: null }))
  const rpc = vi.fn(async () => ({ error: { message: 'refus fictif' } }))
  const stockage = { rpc, storage: { from: () => ({ upload }) } } as unknown as SupabaseClient
  expect(
    await baseSupabase({} as SupabaseClient, stockage).televerser(
      'dossier/objet',
      Buffer.from('chiffre'),
    ),
  ).toBe(false)
  expect(upload).not.toHaveBeenCalled()
})
test('la reservation precede les octets et un upload incertain la laisse recuperable', async () => {
  const etapes: string[] = []
  const upload = vi.fn(async () => {
    etapes.push('octets')
    return { error: { message: 'reponse perdue' } }
  })
  const rpc = vi.fn(async () => {
    etapes.push('reservation')
    return { error: null }
  })
  const stockage = { rpc, storage: { from: () => ({ upload }) } } as unknown as SupabaseClient
  expect(
    await baseSupabase({} as SupabaseClient, stockage).televerser(
      'dossier/objet',
      Buffer.from('chiffre'),
    ),
  ).toBe(false)
  expect(etapes).toEqual(['reservation', 'octets'])
  expect(rpc).toHaveBeenCalledExactlyOnceWith('reserver_depot', { le_chemin: 'dossier/objet' })
})
test('la maintenance ne purge pas apres echec de reprise des reservations', async () => {
  const rpc = vi.fn(async () => ({ error: { message: 'panne fictive' } }))
  await expect(purgerCoffres({ rpc } as unknown as SupabaseClient)).rejects.toThrow(
    'Reprise des depots impossible',
  )
  expect(rpc).toHaveBeenCalledExactlyOnceWith('reprendre_depots_inacheves')
})

test('les metadonnees utilisent le client serveur de depot et jamais le client navigateur', async () => {
  const navigateur = { from: vi.fn() } as unknown as SupabaseClient
  const single = vi.fn(async () => ({ data: { id: 'piece' }, error: null }))
  const stockage = {
    from: vi.fn(() => ({ insert: () => ({ select: () => ({ single }) }) })),
  } as unknown as SupabaseClient
  expect(
    await baseSupabase(navigateur, stockage).inscrirePiece({
      dossierId: 'dossier',
      chemin: 'dossier/objet',
      nature: 'bulletin_paie',
      tailleOctets: 100,
      typeReel: 'application/pdf',
    }),
  ).toBe('piece')
  expect(navigateur.from).not.toHaveBeenCalled()
  expect(stockage.from).toHaveBeenCalledExactlyOnceWith('pieces')
})
