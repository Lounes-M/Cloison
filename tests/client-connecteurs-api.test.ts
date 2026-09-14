import { afterEach, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({ rpc }) }))
import { lireStatuts } from '@/lib/connecteurs/lecture'
import { lireTousLesStatuts } from '../scripts/lire-statuts-connecteur.mjs'
const cle = 'cloison_read_' + 'b'.repeat(43)
const premiere = {
  version: 1,
  dossiers: Array.from({ length: 50 }, (_, i) => ({
    reference: `REF-${String(i).padStart(8, '0')}`,
    etat: 'en_cours',
  })),
  suite: 'REF-00000049',
}
const requete: typeof fetch = async (url, options) => lireStatuts(new Request(url, options))
afterEach(() => vi.resetAllMocks())

test('le client et le handler reel partagent la pagination et l authentification', async () => {
  rpc
    .mockResolvedValueOnce({ data: premiere, error: null })
    .mockResolvedValueOnce({ data: { version: 1, dossiers: [], suite: null }, error: null })
  const resultat = await lireTousLesStatuts(cle, { requete })
  expect(resultat.dossiers).toEqual(premiere.dossiers)
  expect(rpc.mock.calls).toEqual([
    [
      'lire_statuts_connecteur',
      { l_empreinte: createHash('sha256').update(cle).digest('hex'), apres: null },
    ],
    [
      'lire_statuts_connecteur',
      { l_empreinte: createHash('sha256').update(cle).digest('hex'), apres: premiere.suite },
    ],
  ])
})
test.each([
  { data: null, code: 'non_autorise', attente: null },
  { data: { limite: true }, code: 'limite', attente: 60 },
])(
  'une interruption du handler ne devient pas une collecte vide : $code',
  async ({ data, code, attente }) => {
    rpc
      .mockResolvedValueOnce({ data: premiere, error: null })
      .mockResolvedValueOnce({ data, error: null })
    await expect(lireTousLesStatuts(cle, { requete })).rejects.toMatchObject({
      code,
      reessayerApres: attente,
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  },
)
