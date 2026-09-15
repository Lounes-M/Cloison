import { afterEach, expect, test, vi } from 'vitest'
import { reduireSiPhoto } from '@/components/forms/reduire-photo'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function photo() {
  return new File([new Uint8Array(1_500_000)], 'preuve.png', { type: 'image/png' })
}

function navigateur(contexte: object | null) {
  const image = { width: 4000, height: 2000, close: vi.fn() }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => contexte),
    toBlob: vi.fn((recevoir: (blob: Blob) => void) => recevoir(new Blob(['jpeg']))),
  }
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => image),
  )
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  return { image, canvas }
}

test('sans moteur 2D, la photo ne doit pas etre remplacee par une page vide', async () => {
  const { image, canvas } = navigateur(null)
  const original = photo()
  expect(await reduireSiPhoto(original)).toBe(original)
  expect(canvas.toBlob).not.toHaveBeenCalled()
  expect(image.close).toHaveBeenCalledOnce()
})

test('une erreur de dessin conserve la photo et libere son decodage', async () => {
  const { image } = navigateur({
    drawImage: () => {
      throw new Error('moteur indisponible')
    },
  })
  const original = photo()
  expect(await reduireSiPhoto(original)).toBe(original)
  expect(image.close).toHaveBeenCalledOnce()
})

test('le JPEG a un fond blanc avant la copie des pixels transparents', async () => {
  const etapes: string[] = []
  const contexte = {
    fillStyle: '',
    fillRect: vi.fn(() => etapes.push('fond')),
    drawImage: vi.fn(() => etapes.push('photo')),
  }
  const { image, canvas } = navigateur(contexte)
  const reduite = await reduireSiPhoto(photo())
  expect(etapes).toEqual(['fond', 'photo'])
  expect(contexte.fillStyle).toBe('#fff')
  expect(contexte.fillRect).toHaveBeenCalledWith(0, 0, 2000, 1000)
  expect(canvas.width).toBe(2000)
  expect(canvas.height).toBe(1000)
  expect(reduite.name).toBe('preuve.jpg')
  expect(reduite.type).toBe('image/jpeg')
  expect(image.close).toHaveBeenCalledOnce()
})

test('un decodage tardif libere son image sans bloquer le formulaire', async () => {
  vi.useFakeTimers()
  let finir!: (image: ImageBitmap) => void
  const image = { width: 4000, height: 2000, close: vi.fn() }
  vi.stubGlobal(
    'createImageBitmap',
    () =>
      new Promise<ImageBitmap>((resolve) => {
        finir = resolve
      }),
  )
  const toile = vi.fn()
  vi.stubGlobal('document', { createElement: toile })
  const original = photo()
  const resultat = reduireSiPhoto(original)
  await vi.advanceTimersByTimeAsync(10000)
  expect(await resultat).toBe(original)
  finir(image as unknown as ImageBitmap)
  await vi.advanceTimersByTimeAsync(0)
  expect(image.close).toHaveBeenCalledOnce()
  expect(toile).not.toHaveBeenCalled()
})

test('un encodeur silencieux rend le fichier initial dans le budget', async () => {
  vi.useFakeTimers()
  const { canvas, image } = navigateur({ fillRect() {}, drawImage() {} })
  canvas.toBlob.mockImplementation(() => undefined)
  const original = photo()
  const resultat = reduireSiPhoto(original)
  await vi.advanceTimersByTimeAsync(10000)
  expect(await resultat).toBe(original)
  // Le bitmap peut etre libere des que les pixels ont ete copies dans le canvas.
  expect(image.close).toHaveBeenCalledOnce()
})

test('une reduction plus lourde conserve les octets originaux', async () => {
  const { canvas } = navigateur({ fillRect() {}, drawImage() {} })
  canvas.toBlob.mockImplementation((recevoir) => recevoir(new Blob([new Uint8Array(2_000_000)])))
  const original = photo()
  expect(await reduireSiPhoto(original)).toBe(original)
})

test('les entrees de plus de 20 Mo ne sont pas decodees dans le navigateur', async () => {
  const { canvas } = navigateur(null)
  const original = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'grand.png', {
    type: 'image/png',
  })
  expect(await reduireSiPhoto(original)).toBe(original)
  expect(createImageBitmap).not.toHaveBeenCalled()
  expect(canvas.getContext).not.toHaveBeenCalled()
})
