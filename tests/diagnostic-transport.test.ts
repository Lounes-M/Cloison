import { beforeEach, expect, test, vi } from 'vitest'
import { examinerPaiement } from '../scripts/examiner-paiement.mjs'

const h = vi.hoisted(() => ({
  config: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
}))
vi.mock('pg', () => ({
  Client: class {
    constructor(config: unknown) {
      h.config(config)
    }
    connect = h.connect
    end = h.end
    on = h.on
  },
}))
beforeEach(() => {
  vi.clearAllMocks()
  h.connect.mockRejectedValue(new Error('Indisponible'))
  h.end.mockResolvedValue(undefined)
})
test('la connexion distante exige un certificat valide et borne les delais', async () => {
  await expect(
    examinerPaiement({
      connexion: 'postgres://fictif@db.example.invalid/base',
      reference: 'cs_fictif',
      destination: '/inutilise',
    }),
  ).rejects.toThrow()
  expect(h.config).toHaveBeenCalledWith(
    expect.objectContaining({
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 5000,
      query_timeout: 6000,
    }),
  )
  expect(h.end).toHaveBeenCalledOnce()
  expect(h.on).toHaveBeenCalledWith('error', expect.any(Function))
})
test('une URI qui desactive TLS ne construit aucun client', async () => {
  await expect(
    examinerPaiement({
      connexion: 'postgres://fictif@db.example.invalid/base?sslmode=disable',
      reference: 'cs_fictif',
      destination: '/inutilise',
    }),
  ).rejects.toThrow()
  expect(h.config).not.toHaveBeenCalled()
})
