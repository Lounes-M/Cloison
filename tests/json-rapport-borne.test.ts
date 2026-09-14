import { expect, test, vi } from 'vitest'
// @ts-expect-error Utilitaire Node des programmes operateur.
import { lireJsonBorne } from '../scripts/lire-json-borne.mjs'

const signal = () => AbortSignal.timeout(2000)

test('accepte exactement 64 Kio et restitue le JSON sans transformation', async () => {
  const texte = '{"conforme":true}'
  expect(
    await lireJsonBorne(new Response(' '.repeat(65536 - texte.length) + texte), signal()),
  ).toEqual({ conforme: true })
})

test.each(['65537', '-1', '1.5', 'invalide', '9999999999999999999999'])(
  'annule avant lecture une longueur annoncee refusee : %s',
  async (longueur) => {
    const cancel = vi.fn()
    const reponse = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-length': longueur },
    })
    await expect(lireJsonBorne(reponse, signal())).rejects.toThrow(
      'Reponse JSON indisponible ou invalide',
    )
    expect(cancel).toHaveBeenCalledTimes(1)
  },
)

test.each([null, '2'])('borne les octets cumules sans croire la longueur %#', async (longueur) => {
  const headers = new Headers()
  if (longueur !== null) headers.set('content-length', longueur)
  const cancel = vi.fn()
  let blocs = 0
  const reponse = new Response(
    new ReadableStream({
      pull(c) {
        blocs++
        const octets = new Uint8Array(16384).fill(32)
        if (blocs === 1) {
          octets[0] = 123
          octets[1] = 125
        }
        c.enqueue(octets)
        if (blocs === 6) c.close()
      },
      cancel,
    }),
    { headers },
  )
  await expect(lireJsonBorne(reponse, signal())).rejects.toThrow()
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(blocs).toBeLessThanOrEqual(6)
})

test('refuse un UTF-8 invalide au lieu de remplacer des octets', async () => {
  const corps = Buffer.concat([Buffer.from('{"valeur":"'), Buffer.from([0xff]), Buffer.from('"}')])
  await expect(lireJsonBorne(new Response(corps), signal())).rejects.toThrow()
})

test.each(['', '<html>prive@example.test</html>', '{'])(
  'ne propage jamais un corps invalide %#',
  async (corps) => {
    await expect(lireJsonBorne(new Response(corps), signal())).rejects.toThrow(
      /^Reponse JSON indisponible ou invalide$/,
    )
  },
)

test('annule un corps bloque lorsque le budget initial expire', async () => {
  const cancel = vi.fn()
  const reponse = new Response(new ReadableStream({ cancel }))
  const controle = new AbortController()
  const resultat = lireJsonBorne(reponse, controle.signal)
  controle.abort(new Error('secret-prive'))
  await expect(resultat).rejects.toThrow(/^Reponse JSON indisponible ou invalide$/)
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(reponse.body?.locked).toBe(false)
})

test('un budget deja expire ne devient pas un rapport valide', async () => {
  const controle = new AbortController()
  controle.abort()
  await expect(lireJsonBorne(new Response('{}'), controle.signal)).rejects.toThrow()
})

test('un flux en erreur ne divulgue pas son exception', async () => {
  const reponse = new Response(
    new ReadableStream({
      start(c) {
        c.error(new Error('secret-prive'))
      },
    }),
  )
  await expect(lireJsonBorne(reponse, signal())).rejects.toThrow(
    /^Reponse JSON indisponible ou invalide$/,
  )
  expect(reponse.body?.locked).toBe(false)
})
