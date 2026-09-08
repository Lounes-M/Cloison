import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), locataire: vi.fn(), garant: vi.fn(), signer: vi.fn() }))
vi.mock('@/lib/courriels/liens', () => ({
  envoyerLienLocataire: h.locataire,
  envoyerLienGarant: h.garant,
}))
vi.mock('@/lib/acces/jeton', () => ({ signerJeton: h.signer }))
vi.mock('@/lib/acces/session', () => ({ urlDuLien: () => 'https://example.invalid/lien/fictif' }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({ rpc: h.rpc }) }))
import { livrerLiens, reprendreLivraisonLiens } from '@/lib/courriels/livraison-liens'
const lien = {
  id: 'jti',
  dossier_id: 'dossier',
  partie: 'garant',
  expire_le: '2099-01-01T00:00:00Z',
  reference: 'REF',
  destinataire: 'garant@example.invalid',
  demande_par: 'locataire@example.invalid',
}
beforeEach(() => {
  vi.resetAllMocks()
  h.rpc.mockResolvedValue({ data: [lien], error: null })
  h.signer.mockResolvedValue('fictif')
  h.locataire.mockResolvedValue(true)
  h.garant.mockResolvedValue(true)
})
test('la reprise signe le jti durable et conserve son identifiant en file', async () => {
  const db = { rpc: h.rpc } as never
  expect(await livrerLiens(db)).toEqual({ echecs: 0 })
  expect(h.signer).toHaveBeenCalledWith('dossier', 'garant', 'jti', new Date(lien.expire_le))
  expect(h.garant).toHaveBeenCalledWith(
    expect.objectContaining({
      a: lien.destinataire,
      demandePar: lien.demande_par,
      livraison: { db, id: 'jti', differer: true, signal: undefined },
    }),
  )
  expect(h.locataire).not.toHaveBeenCalled()
})
test('un refus de mise en file reste visible et ne demande pas un nouvel identifiant', async () => {
  h.garant.mockResolvedValue(false)
  expect(await livrerLiens({ rpc: h.rpc } as never)).toEqual({ echecs: 1 })
  expect(h.rpc).toHaveBeenCalledTimes(1)
})
test('une panne de reprise immediate ne transforme pas le dossier ouvert en echec', async () => {
  h.rpc.mockRejectedValue(new Error('indisponible'))
  await expect(reprendreLivraisonLiens('dossier')).resolves.toBeUndefined()
  expect(h.signer).not.toHaveBeenCalled()
})
test('un budget termine ne signe ni ne prepare de nouveau courriel', async () => {
  const c = new AbortController()
  c.abort()
  await expect(livrerLiens({ rpc: h.rpc } as never, undefined, c.signal)).rejects.toThrow()
  expect(h.signer).not.toHaveBeenCalled()
  expect(h.garant).not.toHaveBeenCalled()
})
