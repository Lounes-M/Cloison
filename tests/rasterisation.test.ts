import { createCanvas } from '@napi-rs/canvas'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { describe, expect, test } from 'vitest'
import { rasteriser } from '@/lib/coffre/rasterisation'

/**
 * Ce que l'agence recoit a la place du document.
 *
 * Deux affirmations sont faites ailleurs dans le depot, et elles ne valent que
 * si elles sont verifiees ici. La premiere : la rasterisation detruit le
 * contenu actif, ce sur quoi repose le report de l'antivirus. La seconde : le
 * filigrane ne se retire pas, puisqu'il fait partie des pixels.
 *
 * Un piege a eviter, rencontre en preparant ces tests : chercher `/JavaScript`
 * dans les octets de sortie ne prouve rien tant qu'on n'a pas montre qu'il est
 * present dans les octets d'entree. `pdf-lib` compresse les flux par defaut,
 * et la chaine disparait des deux cotes. Les documents d'essai sont donc
 * ecrits sans flux d'objets, et la presence en entree est affirmee.
 */

/** Un PDF avec du texte, et du JavaScript embarque si on le demande. */
async function pdfDEssai({ pages = 1, piege = false } = {}): Promise<Buffer> {
  const document = await PDFDocument.create()
  const police = await document.embedFont(StandardFonts.Helvetica)

  for (let numero = 1; numero <= pages; numero += 1) {
    const page = document.addPage([595, 842])
    page.drawText(`Bulletin de paie, page ${numero}`, {
      x: 60,
      y: 760,
      size: 24,
      font: police,
      color: rgb(0, 0, 0),
    })
    page.drawRectangle({ x: 60, y: 400, width: 400, height: 200, color: rgb(0.1, 0.1, 0.1) })
  }

  if (piege) document.addJavaScript('piege', 'app.alert("ceci ne doit jamais survivre");')

  return Buffer.from(await document.save({ useObjectStreams: false }))
}

/**
 * Un PNG uni, de la taille demandee.
 *
 * Le fond est blanc pur, et pas un gris clair : `grise` compte les pixels sous
 * 250, donc un fond a 242 saturerait la mesure a cent pour cent et le
 * filigrane deviendrait indetectable.
 */
function pngDEssai(largeur = 1200, hauteur = 900): Buffer {
  const toile = createCanvas(largeur, hauteur)
  const ctx = toile.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, largeur, hauteur)
  ctx.fillStyle = '#111111'
  ctx.fillRect(60, 60, 360, 180)
  return toile.toBuffer('image/png')
}

/** Rouvre un PDF produit et rend ce qu'on peut en dire. */
async function relire(pdf: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const chargement = pdfjs.getDocument({ data: new Uint8Array(pdf) })
  const document = await chargement.promise

  const page = await document.getPage(1)
  const vue = page.getViewport({ scale: 1 })
  const toile = createCanvas(Math.ceil(vue.width), Math.ceil(vue.height))
  const ctx = toile.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, toile.width, toile.height)

  await page.render({
    canvas: toile as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport: vue,
  }).promise

  // Deux mesures, parce qu'une seule ne suffit pas et que le decouvrir a
  // coute un test faux. `encre` compte le noir du document. Le filigrane, lui,
  // est pose a dix-huit pour cent : sur du blanc il produit du gris autour de
  // 218, et ne franchit JAMAIS le seuil de 200. Le mesurer avec `encre`
  // revenait a le chercher la ou il ne peut pas etre.
  const pixels = ctx.getImageData(0, 0, toile.width, toile.height).data
  let encre = 0
  let grise = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const valeur = pixels[i] ?? 255
    if (valeur < 200) encre += 1
    if (valeur < 250) grise += 1
  }

  const scripts = await document.getJSActions()
  const nombreDePages = document.numPages

  // Le texte encore selectionnable, s'il en reste : dans une photographie de
  // document, il n'en reste aucun.
  const contenu = await page.getTextContent()
  const texte = contenu.items.map((item) => ('str' in item ? item.str : '')).join('')

  await chargement.destroy()
  return {
    encre,
    grise,
    scripts,
    nombreDePages,
    texte,
    largeur: toile.width,
    hauteur: toile.height,
  }
}

describe('les polices standard', () => {
  test('elles sont bien la, sinon les pages sortiraient sans leur texte', async () => {
    const { createRequire } = await import('node:module')
    const { existsSync } = await import('node:fs')
    const racine = createRequire(import.meta.url)
      .resolve('pdfjs-dist/package.json')
      .replace(/package\.json$/, 'standard_fonts/')

    // Le piege silencieux du module : sans ces fichiers, pdf.js se contente
    // d'un avertissement et rend la page vide. Un bulletin de paie blanc
    // arriverait a l'agence sans qu'aucune erreur ne soit levee.
    expect(existsSync(racine)).toBe(true)
  })
})

describe('ce que la rasterisation detruit', () => {
  test('un PDF piege ressort sans son JavaScript', async () => {
    const entree = await pdfDEssai({ piege: true })

    // La moitie du test qui manquait la premiere fois : sans elle, l'absence
    // en sortie ne prouverait rien.
    expect(entree.includes('/JavaScript')).toBe(true)
    expect(entree.includes('/Names')).toBe(true)

    const sortie = await rasteriser(entree, 'application/pdf', 'essai')

    expect(sortie.includes('/JavaScript')).toBe(false)
    expect((await relire(sortie)).scripts).toBeNull()
  }, 30_000)

  test('le texte n est plus du texte', async () => {
    const sortie = await rasteriser(await pdfDEssai(), 'application/pdf', 'essai')
    const relu = await relire(sortie)

    // Une photographie de document : plus rien ne se selectionne ni ne se
    // copie. C'est la contrepartie assumee du procede.
    expect(relu.texte).toBe('')
  }, 30_000)

  test('la page rendue contient bien de l encre', async () => {
    // Le test qui empeche tous les autres de passer pour rien : une page
    // blanche n a ni JavaScript ni texte selectionnable non plus.
    const sortie = await rasteriser(await pdfDEssai(), 'application/pdf', 'essai')
    expect((await relire(sortie)).encre).toBeGreaterThan(10_000)
  }, 30_000)
})

describe('le filigrane', () => {
  test('il ajoute de l encre partout sur la page', async () => {
    const entree = await pdfDEssai()
    const sans = await relire(await rasteriser(entree, 'application/pdf', ''))
    const avec = await relire(await rasteriser(entree, 'application/pdf', 'marie@agence-lyon3.fr'))

    // Il fait partie des pixels : il n'y a pas de calque a retirer, seulement
    // une image a recadrer, et il est repete pour que le recadrage n'en vienne
    // pas a bout.
    expect(avec.grise).toBeGreaterThan(sans.grise + 5_000)

    // Et il reste discret : il ne noircit pas la page, sinon il rendrait
    // illisible ce qu'il sert a proteger.
    //
    // Une tolerance, et non l'egalite exacte, qui a fait rouge la CI pour rien :
    // le rendu n'est pas identique au pixel pres d'une machine a l'autre, et un
    // bord anticrenele qui franchit le seuil n'est pas une regression. Ce qu'on
    // affirme est un ordre de grandeur, pas un compte.
    expect(Math.abs(avec.encre - sans.encre)).toBeLessThan(sans.encre * 0.005)
  }, 60_000)

  test('il tient aussi sur une image deposee', async () => {
    const image = pngDEssai()
    const sans = await relire(await rasteriser(image, 'image/png', ''))
    const avec = await relire(await rasteriser(image, 'image/png', 'marie@agence-lyon3.fr'))

    expect(avec.grise).toBeGreaterThan(sans.grise)
  }, 30_000)
})

describe('ce qui entre et ce qui sort', () => {
  test('une image ressort en PDF d une page', async () => {
    const sortie = await rasteriser(pngDEssai(), 'image/png', 'essai')

    // L'agence recoit une seule forme et n'a pas a savoir ce que le garant
    // avait sous la main.
    expect(sortie.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect((await relire(sortie)).nombreDePages).toBe(1)
  }, 30_000)

  test('un PDF de trois pages en rend trois', async () => {
    const sortie = await rasteriser(await pdfDEssai({ pages: 3 }), 'application/pdf', 'essai')
    expect((await relire(sortie)).nombreDePages).toBe(3)
  }, 60_000)

  test('la page de sortie garde le format de la page d origine', async () => {
    const sortie = await rasteriser(await pdfDEssai(), 'application/pdf', 'essai')
    const relu = await relire(sortie)

    // A4, en points, et non les 1240 points de la toile a 150 ppp : sinon la
    // piece serait lisible a l'ecran et absurde a l'impression.
    expect(relu.largeur).toBe(595)
    expect(relu.hauteur).toBe(842)
  }, 30_000)

  test('un document trop long est refuse avant d occuper la machine', async () => {
    const trop = await pdfDEssai({ pages: 41 })
    await expect(rasteriser(trop, 'application/pdf', 'essai')).rejects.toThrow(/41 pages/)
  }, 60_000)

  test('un contenu qui n est pas un PDF fait echouer plutot que rendre du vide', async () => {
    const bouillie = Buffer.from('%PDF-1.7 ceci n est pas un document', 'latin1')
    await expect(rasteriser(bouillie, 'application/pdf', 'essai')).rejects.toThrow()
  }, 30_000)
})
