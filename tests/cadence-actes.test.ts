import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { lireCadenceActes } from '@/lib/exploitation/cadence-actes.mjs'
// @ts-expect-error Programme Node autonome.
import { verifierCadenceActes } from '../scripts/verifier-cadence-actes.mjs'
const maintenant = Date.parse('2026-10-05T12:00:00Z')
const bilan = () => ({
  version: 1,
  reprises_a_examiner: 0,
  traitements: Object.fromEntries(
    ['signature', 'archives', 'reglements'].map((n) => [
      n,
      { confirme_le: '2026-10-05T11:55:00Z', reussi: true },
    ]),
  ),
})
afterEach(() => vi.unstubAllGlobals())
test('les trois traitements doivent etre recents et reussis', () => {
  expect(lireCadenceActes(bilan(), maintenant)).toEqual({ conforme: true })
})
test.each([null, '2026-10-05T11:44:59Z', '2026-10-05T12:01:01Z'])(
  'un traitement absent, ancien ou futur rend le bilan rouge %s',
  (date) => {
    const b = bilan()
    b.traitements.archives!.confirme_le = date as string
    expect(lireCadenceActes(b, maintenant)).toEqual({ conforme: false })
  },
)
test('un echec recent ou des reprises persistantes restent visibles', () => {
  const b = bilan()
  b.traitements.signature!.reussi = false
  expect(lireCadenceActes(b, maintenant)).toEqual({ conforme: false })
  b.traitements.signature!.reussi = true
  b.reprises_a_examiner = 1
  expect(lireCadenceActes(b, maintenant)).toEqual({ conforme: false })
})
test('un rapport incomplet ou enrichi de donnees inattendues est refuse', () => {
  expect(() => lireCadenceActes({}, maintenant)).toThrow()
  expect(() => lireCadenceActes({ ...bilan(), detail: 'PRIVE' }, maintenant)).toThrow()
})
beforeEach(() =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"conforme":true}'))),
)
test('le controle distant exige une confirmation exacte et un statut 200', async () => {
  expect(await verifierCadenceActes('fixture')).toEqual({ conforme: true })
  expect(fetch).toHaveBeenCalledWith(
    'https://www.cloison.immo/api/actes/etat',
    expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer fixture' } }),
  )
  vi.mocked(fetch).mockResolvedValue(new Response('{"conforme":true}', { status: 503 }))
  await expect(verifierCadenceActes('fixture')).rejects.toThrow()
  vi.mocked(fetch).mockResolvedValue(new Response('{"conforme":true,"detail":"PRIVE"}'))
  await expect(verifierCadenceActes('fixture')).rejects.toThrow()
})
