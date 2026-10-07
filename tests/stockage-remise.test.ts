import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { stockageRemise } from '../scripts/stockage-remise-droits.mjs'
const configuration = { projet: 'a'.repeat(20), jeton: 'fictif-sans-valeur-de-production' }
test.each(['succes', 'collision', 'perdue'])(
  'une publication %s relit toujours les octets sans ecrasement',
  async (cas) => {
    const archive = randomBytes(100),
      id = randomUUID()
    const requete = vi.fn<typeof fetch>(async (_url, options) => {
      if (options?.method === 'POST') {
        expect(options.headers).toMatchObject({ 'x-upsert': 'false' })
        if (cas === 'perdue') throw new Error('Reseau fictif')
        return new Response('', { status: cas === 'collision' ? 409 : 200 })
      }
      return new Response(archive)
    })
    await expect(stockageRemise(configuration, requete)(id, archive)).resolves.toBeUndefined()
    expect(requete).toHaveBeenCalledTimes(2)
    for (const [url, options] of requete.mock.calls) {
      expect(url).toBe(
        `https://${configuration.projet}.supabase.co/storage/v1/object/exports-droits/${id}`,
      )
      expect(options?.redirect).toBe('error')
    }
  },
)
test.each(['different', 'absent', 'long', 'court', 'panne'])(
  'une verification distante %s interdit activation',
  async (cas) => {
    const archive = randomBytes(100)
    const requete = vi.fn<typeof fetch>(async (_url, options) => {
      if (options?.method === 'POST') return new Response('')
      if (cas === 'panne') throw new Error('secret-fictif')
      return new Response(
        cas === 'different'
          ? randomBytes(100)
          : cas === 'long'
            ? Buffer.concat([archive, Buffer.from('a')])
            : cas === 'court'
              ? archive.subarray(0, 99)
              : '',
        { status: cas === 'absent' ? 404 : 200 },
      )
    })
    await expect(stockageRemise(configuration, requete)(randomUUID(), archive)).rejects.toThrow(
      'Ecriture Storage non confirmee.',
    )
  },
)
