import { createHash } from 'node:crypto'
import { afterEach, expect, test, vi } from 'vitest'
import { fluxRemise } from '@/lib/droits/flux-remise'
afterEach(() => vi.unstubAllGlobals())
test.each(['succes', 'long', 'court', 'alteration', 'panne', 'annulation'])(
  'relai borne : %s',
  async (cas) => {
    const contenu = Buffer.from('paquet fictif'),
      hash = createHash('sha256').update(contenu).digest('hex')
    const controle = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            cas === 'long'
              ? Buffer.concat([contenu, contenu])
              : cas === 'court'
                ? contenu.subarray(1)
                : cas === 'alteration'
                  ? Buffer.alloc(contenu.length)
                  : contenu,
          ),
      ),
    )
    if (cas === 'panne')
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('', { status: 503 })),
      )
    const travail = async () => {
      const flux = await fluxRemise(
        'https://fixture.invalid',
        contenu.length,
        hash,
        controle.signal,
      )
      if (cas === 'annulation') controle.abort()
      return Buffer.from(await new Response(flux).arrayBuffer())
    }
    if (cas === 'succes') expect(await travail()).toEqual(contenu)
    else await expect(travail()).rejects.toThrow('Paquet indisponible.')
  },
)
