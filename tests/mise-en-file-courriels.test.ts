import { beforeEach, expect, test, vi } from 'vitest'

const { rpc, distribuerCourriels } = vi.hoisted(() => ({
  rpc: vi.fn(),
  distribuerCourriels: vi.fn(),
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({ rpc }) }))
vi.mock('@/lib/coffre/enveloppe', () => ({ sceller: () => Buffer.from('chiffre-fictif') }))
vi.mock('@/lib/coffre/cle-maitresse', () => ({ cleMaitresse: () => Buffer.alloc(32) }))
vi.mock('@/lib/env', () => ({ env: { emailExpediteur: 'source@example.invalid' } }))
vi.mock('@/lib/courriels/file', () => ({ distribuerCourriels }))
import { envoyer } from '@/lib/courriels/envoi'

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ error: null })
})

test('une notification differee est durable avant succes et ne bloque pas sur Resend', async () => {
  expect(
    await envoyer('dest@example.invalid', 'Sujet', 'Texte', 'id-fictif', undefined, true),
  ).toBe(true)
  expect(rpc).toHaveBeenCalledWith(
    'mettre_courriel_en_file',
    expect.objectContaining({ identifiant: 'id-fictif' }),
  )
  expect(distribuerCourriels).not.toHaveBeenCalled()
  rpc.mockResolvedValue({ error: { code: 'indisponible' } })
  expect(
    await envoyer('dest@example.invalid', 'Sujet', 'Texte', 'id-fictif', undefined, true),
  ).toBe(false)
})

test('un lien conserve la tentative immediate apres sa mise en file', async () => {
  expect(await envoyer('dest@example.invalid', 'Sujet', 'Texte', 'id-fictif')).toBe(true)
  expect(distribuerCourriels).toHaveBeenCalledWith(expect.anything(), 'id-fictif', undefined)
})

test('un lien exige la confirmation atomique de sa mise en file', async () => {
  const contexte = { db: { rpc } as never, lien: true }
  for (const data of [false, null, undefined, 'true']) {
    rpc.mockResolvedValue({ data, error: null })
    expect(
      await envoyer('dest@example.invalid', 'Sujet', 'Texte', 'id', undefined, true, contexte),
    ).toBe(false)
  }
  expect(distribuerCourriels).not.toHaveBeenCalled()
  rpc.mockResolvedValue({ data: true, error: null })
  expect(
    await envoyer('dest@example.invalid', 'Sujet', 'Texte', 'id', undefined, true, contexte),
  ).toBe(true)
  expect(rpc).toHaveBeenLastCalledWith(
    'mettre_lien_en_file',
    expect.objectContaining({ identifiant: 'id' }),
  )
})
