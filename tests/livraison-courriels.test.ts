import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, expect, test, vi } from 'vitest'

const { envoyer, ouvrir, envoyerResend } = vi.hoisted(() => ({
  envoyer: vi.fn(),
  ouvrir: vi.fn(),
  envoyerResend: vi.fn(),
}))
vi.mock('@/lib/courriels/envoi', () => ({
  envoyer,
  adresseDuSite: () => 'https://example.invalid',
}))
vi.mock('@/lib/coffre/enveloppe', () => ({ ouvrir }))
vi.mock('@/lib/coffre/cle-maitresse', () => ({ cleMaitresse: () => Buffer.alloc(32) }))
vi.mock('@/lib/env', () => ({ env: { resendApiKey: 'fixture' } }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: envoyerResend }
  },
}))
import { livrerNotifications } from '@/lib/courriels/notifications'
import { distribuerCourriels } from '@/lib/courriels/file'

beforeEach(() => {
  vi.clearAllMocks()
  envoyer.mockResolvedValue(true)
})

test('une adresse commune a deux roles conserve les deux contenus et leur idempotence', async () => {
  const evenement = {
    id: '11111111-1111-4111-8111-111111111111',
    dossier: {
      id: '22222222-2222-4222-8222-222222222222',
      reference: 'TEST',
      statut: 'complet',
      email_locataire: 'commun@example.invalid',
      email_garant: null,
      demonstration: false,
    },
    contacts: ['commun@example.invalid'],
  }
  const rpc = vi.fn(async (nom: string) => ({
    data: nom === 'notifications_a_livrer' ? [evenement] : null,
    error: null,
  }))
  await livrerNotifications({ rpc } as unknown as SupabaseClient)
  const ids = envoyer.mock.calls.map((appel) => appel[3])
  expect(ids).toHaveLength(2)
  expect(new Set(ids).size).toBe(2)
  await livrerNotifications({ rpc } as unknown as SupabaseClient)
  expect(envoyer.mock.calls.slice(2).map((appel) => appel[3])).toEqual(ids)
})

test('le passage qui decouvre une reconciliation ne retourne pas un faux succes', async () => {
  let reconciliation = 0
  const rpc = vi.fn(async (nom: string) => {
    if (nom === 'prendre_courriels') reconciliation = 1
    return { data: nom === 'etat_file_courriels' ? reconciliation : [], error: null }
  })
  expect(await distribuerCourriels({ rpc } as unknown as SupabaseClient)).toEqual({
    traites: 0,
    echecs: 1,
  })
})

test('une reponse sans identifiant Resend ne detruit pas le contenu chiffre', async () => {
  ouvrir.mockReturnValue(Buffer.from('{}'))
  envoyerResend.mockResolvedValue({ data: {}, error: null })
  const rpc = vi.fn(async (nom: string) => ({
    data: nom === 'prendre_courriels' ? [{ id: 'id-fictif', contenu: '', bail: 'bail-fictif' }] : 0,
    error: null,
  }))
  expect(await distribuerCourriels({ rpc } as unknown as SupabaseClient)).toEqual({
    traites: 0,
    echecs: 1,
  })
  expect(rpc).toHaveBeenCalledWith('acquitter_courriel', {
    identifiant: 'id-fictif',
    le_bail: 'bail-fictif',
    reference_fournisseur: null,
  })
})

test.each([true, false, null])(
  'la reference fournisseur et la confirmation SQL %s restent distinctes de la livraison',
  async (confirmation) => {
    ouvrir.mockReturnValue(Buffer.from('{}'))
    envoyerResend.mockResolvedValue({ data: { id: 'resend_fictif' }, error: null })
    const rpc = vi.fn(async (nom: string) => ({
      data:
        nom === 'prendre_courriels'
          ? [{ id: 'id-fictif', contenu: '', bail: 'bail-fictif' }]
          : nom === 'acquitter_courriel'
            ? confirmation
            : 0,
      error: null,
    }))
    expect(await distribuerCourriels({ rpc } as unknown as SupabaseClient)).toEqual({
      traites: confirmation === true ? 1 : 0,
      echecs: confirmation === true ? 0 : 1,
    })
    expect(rpc).toHaveBeenCalledWith('acquitter_courriel', {
      identifiant: 'id-fictif',
      le_bail: 'bail-fictif',
      reference_fournisseur: 'resend_fictif',
    })
    expect(envoyerResend).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [{ name: 'cloison_id', value: 'id-fictif' }] }),
      expect.any(Object),
    )
  },
)
