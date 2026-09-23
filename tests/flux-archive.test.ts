import { expect, test, vi } from 'vitest'
import { fluxArchive } from '@/lib/signature/flux-archive'
const document = () => Buffer.alloc(150000, 73)
test('restitue chaque octet et efface la source des le dernier bloc', async () => {
  const source = document()
  const attendu = Buffer.from(source)
  const c = new AbortController()
  const retirer = vi.spyOn(c.signal, 'removeEventListener')
  const lecteur = fluxArchive(source, c.signal).getReader()
  const blocs: Uint8Array[] = []
  for (let i = 0; i < 3; i++) {
    const r = await lecteur.read()
    expect(r.done).toBe(false)
    expect(r.value!.byteLength).toBeLessThanOrEqual(65536)
    blocs.push(r.value!)
  }
  expect(source.every((octet) => octet === 0)).toBe(true)
  expect(Buffer.concat(blocs)).toEqual(attendu)
  expect(await lecteur.read()).toEqual({ done: true, value: undefined })
  expect(retirer).toHaveBeenCalledWith('abort', expect.any(Function))
  c.abort()
  expect(Buffer.concat(blocs)).toEqual(attendu)
})
test('une interruption efface sans attendre que le destinataire commence a lire', async () => {
  const source = document()
  const c = new AbortController()
  const flux = fluxArchive(source, c.signal)
  await Promise.resolve()
  c.abort(new Error('DETAIL_PRIVE'))
  expect(source.every((octet) => octet === 0)).toBe(true)
  await expect(new Response(flux).arrayBuffer()).rejects.toThrow(/^Lecture interrompue$/)
})
test('une lecture arretee apres un bloc ne conserve pas le reste du PDF', async () => {
  const source = document()
  const c = new AbortController()
  const lecteur = fluxArchive(source, c.signal).getReader()
  const premier = (await lecteur.read()).value!
  c.abort()
  expect(source.every((octet) => octet === 0)).toBe(true)
  expect(Buffer.from(premier)).toEqual(Buffer.alloc(65536, 73))
  await expect(lecteur.read()).rejects.toThrow('Lecture interrompue')
})
test('un delai depasse efface meme sans lecture ni annulation explicite', async () => {
  const source = document()
  const flux = fluxArchive(source, AbortSignal.timeout(20))
  await vi.waitFor(() => expect(source.every((octet) => octet === 0)).toBe(true), {
    timeout: 1000,
    interval: 10,
  })
  await expect(new Response(flux).arrayBuffer()).rejects.toThrow('Lecture interrompue')
})
test.each([false, true])(
  'une annulation efface le tampon, lecture commencee : %s',
  async (commence) => {
    const source = document()
    const c = new AbortController()
    const retirer = vi.spyOn(c.signal, 'removeEventListener')
    const lecteur = fluxArchive(source, c.signal).getReader()
    if (commence) await lecteur.read()
    await lecteur.cancel()
    expect(source.every((octet) => octet === 0)).toBe(true)
    expect(retirer).toHaveBeenCalledWith('abort', expect.any(Function))
    c.abort()
    expect(await lecteur.read()).toEqual({ done: true, value: undefined })
  },
)
test('un signal deja interrompu ne laisse aucun octet disponible', async () => {
  const source = document()
  const flux = fluxArchive(source, AbortSignal.abort())
  expect(source.every((octet) => octet === 0)).toBe(true)
  await expect(new Response(flux).arrayBuffer()).rejects.toThrow('Lecture interrompue')
})
