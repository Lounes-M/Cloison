import { createCanvas, loadImage } from '@napi-rs/canvas'
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  assemblerPdf,
  PAGES_MAX,
  reunirPhotos,
  type PageJpeg,
} from '@/components/forms/reunir-photos'
import { rasteriserAvecPages } from '@/lib/coffre/rasterisation'
import { verifierContenu } from '@/lib/coffre/type-reel'
import { TAILLE_MAX_DEPOT } from '@/lib/garant/validation'
import { apercuPageActe } from '@/workers/rasterisation'
import { verifierDocument } from '@/workers/validation-document'

/**
 * Plusieurs photos, une seule piece.
 *
 * Le PDF est ecrit a la main dans le navigateur : ce qui compte est donc que
 * le serveur, lui, le lise comme n'importe quel autre. Les premiers tests le
 * passent par les memes verifications et le meme moteur de rendu qu'un depot.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

function pageDEssai(largeur: number, hauteur: number, couleur: string): PageJpeg {
  const toile = createCanvas(largeur, hauteur)
  const ctx = toile.getContext('2d')
  ctx.fillStyle = couleur
  ctx.fillRect(0, 0, largeur, hauteur)
  return { octets: new Uint8Array(toile.toBuffer('image/jpeg')), largeur, hauteur }
}

describe('le PDF assemble', () => {
  const pages = [
    pageDEssai(1500, 2000, '#c00000'),
    pageDEssai(2000, 1500, '#00a000'),
    pageDEssai(900, 2000, '#0000c0'),
  ]
  const pdf = Buffer.from(assemblerPdf(pages))

  test('passe les verifications du depot', async () => {
    expect(verifierContenu(pdf)).toEqual({ accepte: true, type: 'application/pdf' })
    await expect(verifierDocument(pdf, 'application/pdf')).resolves.toBeUndefined()
  })

  test('compte une page par photo pour le moteur qui prepare la copie de l agence', async () => {
    expect((await rasteriserAvecPages(pdf, 'application/pdf', 'essai')).pages).toBe(3)
  })

  test('garde l ordre, le sens et les couleurs de chaque photo', async () => {
    const attendues = [
      { rouge: true, portrait: true },
      { vert: true, portrait: false },
      { bleu: true, portrait: true },
    ]
    for (const [indice, attendue] of attendues.entries()) {
      const image = await loadImage(await apercuPageActe(pdf, indice + 1))
      expect(image.height > image.width).toBe(attendue.portrait)
      const toile = createCanvas(image.width, image.height)
      const ctx = toile.getContext('2d')
      ctx.drawImage(image, 0, 0)
      // Le centre et un coin : la photo remplit toute sa page.
      for (const [x, y] of [
        [image.width / 2, image.height / 2],
        [image.width - 3, image.height - 3],
      ] as const) {
        const [r, v, b] = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
        expect(r! > 150).toBe(Boolean(attendue.rouge))
        expect(v! > 120).toBe(Boolean(attendue.vert))
        expect(b! > 150).toBe(Boolean(attendue.bleu))
      }
    }
  })
})

/** Un navigateur de doublure : chaque encodage pese ce que `peser` decide. */
function navigateur(peser: (cote: number, qualite: number) => number) {
  const decodages = vi.fn(async () => ({ width: 3000, height: 4000, close: vi.fn() }))
  vi.stubGlobal('createImageBitmap', decodages)
  vi.stubGlobal('document', {
    createElement: () => {
      const toile = {
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect() {}, drawImage() {} }),
        toBlob(recevoir: (blob: Blob) => void, _type: string, qualite: number) {
          recevoir(new Blob([new Uint8Array(peser(Math.max(toile.width, toile.height), qualite))]))
        },
      }
      return toile
    },
  })
  return decodages
}

const photo = (nom: string) => new File([new Uint8Array(10)], nom, { type: 'image/jpeg' })

describe('la reunion des photos', () => {
  test('rend un seul PDF, sous la borne de depot', async () => {
    navigateur(() => 400_000)
    const reunion = await reunirPhotos([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')])
    if (!reunion.ok) throw new Error(reunion.raison)
    expect(reunion.fichier.type).toBe('application/pdf')
    expect(reunion.fichier.size).toBeGreaterThan(1_200_000)
    expect(reunion.fichier.size).toBeLessThanOrEqual(TAILLE_MAX_DEPOT)
    expect(Buffer.from(await reunion.fichier.arrayBuffer()).toString('latin1', 0, 5)).toBe('%PDF-')
  })

  test('allege les pages par paliers quand elles pesent trop ensemble', async () => {
    const cotes: number[] = []
    navigateur((cote) => {
      cotes.push(cote)
      return cote >= 2000 ? 900_000 : cote >= 1700 ? 700_000 : 450_000
    })
    const reunion = await reunirPhotos(Array.from({ length: 8 }, (_, i) => photo(`${i}.jpg`)))
    expect(reunion.ok).toBe(true)
    expect(new Set(cotes)).toEqual(new Set([2000, 1700, 1450]))
    if (reunion.ok) expect(reunion.fichier.size).toBeLessThanOrEqual(TAILLE_MAX_DEPOT)
  })

  test('refuse plutot que de rendre des pages illisibles', async () => {
    navigateur(() => 900_000)
    expect(await reunirPhotos(Array.from({ length: 8 }, (_, i) => photo(`${i}.jpg`)))).toEqual({
      ok: false,
      raison: 'trop_lourd',
    })
  })

  test('ne redecode pas une photo deja preparee quand une page s ajoute', async () => {
    const decodages = navigateur(() => 100_000)
    const premieres = [photo('a.jpg'), photo('b.jpg')]
    await reunirPhotos(premieres)
    expect(decodages).toHaveBeenCalledTimes(2)
    await reunirPhotos([...premieres, photo('c.jpg')])
    expect(decodages).toHaveBeenCalledTimes(3)
  })

  test('nomme la photo illisible et le trop grand nombre de pages', async () => {
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('format inconnu')
    })
    expect(await reunirPhotos([photo('a.jpg'), photo('b.jpg')])).toEqual({
      ok: false,
      raison: 'illisible',
    })
    expect(
      await reunirPhotos(Array.from({ length: PAGES_MAX + 1 }, (_, i) => photo(`${i}.jpg`))),
    ).toEqual({ ok: false, raison: 'trop_de_pages' })
  })
})
