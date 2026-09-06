import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type Canvas,
  type SKRSContext2D,
} from '@napi-rs/canvas'
import { PDFDocument } from 'pdf-lib'

import { verifierDocument } from './validation-document.ts'
import { verifierDimensions } from './dimensions.ts'
import type { TypeAccepte } from '../lib/coffre/type-reel.ts'

/**
 * Ce que l'agence recoit a la place du document.
 *
 * La piece est redessinee page par page, puis reassemblee en PDF d'images. Ce
 * qui en sort n'est plus un document : c'est une photographie de document.
 *
 * Le detour a deux effets, et le second n'a pas ete cherche. Le premier est le
 * filigrane, qui ne se retire pas puisqu'il fait partie des pixels. Le second
 * est que tout contenu actif disparait au passage : JavaScript embarque,
 * formulaires, fichiers joints, actions d'ouverture. Une surface d'attaque
 * entiere s'en va sans qu'on ait eu a la traiter pour elle-meme, et c'est ce
 * qui rend l'absence d'antivirus tenable (voir `docs/dettes.md`).
 *
 * Le choix des briques n'est pas indifferent. Les moteurs PDF les plus connus,
 * MuPDF et ses derives, sont sous AGPL : les employer dans un service en ligne
 * obligerait a en ouvrir le source. `pdfjs-dist` est en Apache 2.0,
 * `@napi-rs/canvas` et `pdf-lib` en MIT. La question de licence ne se pose
 * donc pas, elle a ete evitee.
 *
 * Consequence a connaitre : ce module tourne en runtime Node, jamais Edge, et
 * il est lourd. Il ne s'appelle que depuis une route serveur.
 */

/**
 * 150 points par pouce.
 *
 * Assez pour lire un bulletin de paie a l'ecran et pour zoomer un peu, sans
 * produire des pages de plusieurs megaoctets. Une page A4 pese environ vingt
 * kilooctets a cette resolution.
 */
const RESOLUTION = 150

/** Le PDF compte en points typographiques, soit un soixante-douzieme de pouce. */
const POINTS_PAR_POUCE = 72

/**
 * Au-dela, on rend une erreur plutot qu'occuper une fonction serverless
 * pendant une minute. Les plafonds de depot bornent deja le poids, pas le
 * nombre de pages.
 */
const PAGES_MAXIMUM = 40

/**
 * Les polices standard, que pdf.js va chercher sur disque.
 *
 * Leur absence est le piege de ce module, parce qu'elle ne se voit pas : pdf.js
 * emet un avertissement et rend la page SANS son texte. Des bulletins de paie
 * blancs arriveraient a l'agence sans qu'aucune erreur ne soit levee nulle
 * part.
 *
 * Le risque est reel en production : ces fichiers vivent dans `node_modules` et
 * ne sont atteints par aucun `import`, donc le tracage de Next ne les emporte
 * pas de lui-meme. La route qui appellera ce module devra les nommer dans
 * `outputFileTracingIncludes`. En attendant, on echoue ici, bruyamment.
 */
function racineDesPolices(): string {
  const require = createRequire(import.meta.url)
  const racine = require
    .resolve('pdfjs-dist/package.json')
    .replace(/package\.json$/, 'standard_fonts/')

  if (!existsSync(racine)) {
    throw new Error(
      `Les polices standard de pdf.js sont introuvables (${racine}). ` +
        'Sans elles les pages sortent sans leur texte, et rien ne le signale. ' +
        'Ajoute `pdfjs-dist/standard_fonts/**` a `outputFileTracingIncludes` ' +
        'pour la route qui ouvre les pieces.',
    )
  }

  return racine
}

/**
 * Le chargement de pdf.js, differe.
 *
 * Le module est volumineux et n'a rien a faire dans le graphe d'un rendu qui
 * n'ouvre aucune piece.
 */
async function moteurPdf() {
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

/**
 * Le filigrane, en diagonale et repete.
 *
 * Dessine apres la page et non avant : ce qui est en dessous ne se recadre
 * pas. Repete, parce qu'une seule mention se recadre justement.
 */
export function poserFiligrane(
  ctx: SKRSContext2D,
  largeur: number,
  hauteur: number,
  texte: string,
) {
  const police = 'CloisonFiligrane'
  if (texte && !GlobalFonts.has(police)) {
    // Les fonctions serverless peuvent n avoir aucune police systeme.
    // Ce fichier est deja transporte avec les polices standard de pdf.js.
    const fichier = `${racineDesPolices()}LiberationSans-Regular.ttf`
    if (!GlobalFonts.registerFromPath(fichier, police)) {
      throw new Error('Police du filigrane indisponible')
    }
  }
  const taille = Math.max(14, Math.round(largeur / 42))

  ctx.save()
  ctx.globalAlpha = 0.18
  ctx.fillStyle = '#101010'
  ctx.font = `${taille}px ${police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.translate(largeur / 2, hauteur / 2)
  ctx.rotate(-Math.PI / 6)

  // Mesurer le texte reel : un pas fixe superposait les adresses longues.
  // Chaque bloc conserve toute l identite, repartie en lignes si necessaire.
  const lignes: string[] = []
  const largeurMax = largeur * 0.65
  let ligne = ''
  for (const mot of texte.split(/(?<=\s)/u)) {
    if (ligne && ctx.measureText(ligne + mot).width > largeurMax) {
      lignes.push(ligne)
      ligne = ''
    }
    // Une adresse exceptionnellement longue doit aussi tenir sans etre tronquee.
    for (const caractere of mot) {
      if (ligne && ctx.measureText(ligne + caractere).width > largeurMax) {
        lignes.push(ligne)
        ligne = ''
      }
      ligne += caractere
    }
  }
  if (ligne) lignes.push(ligne)
  const largeurBloc = Math.max(0, ...lignes.map((l) => ctx.measureText(l).width))
  const interligne = taille * 1.4
  const pasX = Math.max(taille * 9 * 1.6, largeurBloc + taille * 3)
  const pasY = Math.max(taille * 9, lignes.length * interligne + taille * 3)
  const portee = Math.ceil(Math.hypot(largeur, hauteur) / 2)

  // Ancrer une copie complete au centre, pas uniquement des fragments aux bords.
  for (let iy = -Math.ceil(portee / pasY); iy <= Math.ceil(portee / pasY); iy++) {
    for (let ix = -Math.ceil(portee / pasX); ix <= Math.ceil(portee / pasX); ix++) {
      for (const [numero, contenu] of lignes.entries()) {
        ctx.fillText(
          contenu,
          ix * pasX,
          iy * pasY + (numero - (lignes.length - 1) / 2) * interligne,
        )
      }
    }
  }

  ctx.restore()
}

/**
 * pdf.js est type pour le navigateur, la toile de `@napi-rs/canvas` ne l'est
 * pas. Les deux se comportent pareil sur ce que le rendu utilise ; ces deux
 * conversions disent que le rapprochement est delibere, et les isolent en un
 * seul endroit plutot que de les eparpiller dans la boucle.
 */
function enToileDom(toile: Canvas): HTMLCanvasElement {
  return toile as unknown as HTMLCanvasElement
}

function enContexteDom(ctx: SKRSContext2D): CanvasRenderingContext2D {
  return ctx as unknown as CanvasRenderingContext2D
}

/** Une toile blanche : un PDF transparent deviendrait noir sans elle. */
function toileBlanche(largeur: number, hauteur: number) {
  verifierDimensions(largeur, hauteur)
  const toile = createCanvas(Math.ceil(largeur), Math.ceil(hauteur))
  const ctx = toile.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, toile.width, toile.height)
  return { toile, ctx }
}

/** Les pages d'un PDF, redessinees une par une. */
async function pagesDuPdf(contenu: Buffer, filigrane: string) {
  const pdfjs = await moteurPdf()

  // Note sur le document hostile : pdf.js 6 n'appelle plus `eval` ni `new
  // Function` nulle part dans son paquet distribue, ce qui a ete verifie plutot
  // que suppose. L'ancien drapeau `isEvalSupported` a disparu avec l'usage
  // qu'il encadrait ; le poser ici aurait affiche une garantie sans objet.
  const chargement = pdfjs.getDocument({
    data: new Uint8Array(contenu),
    standardFontDataUrl: racineDesPolices(),
    maxImageSize: 12_000_000,
  })

  try {
    const document = await chargement.promise

    if (document.numPages > PAGES_MAXIMUM) {
      throw new Error(
        `Ce document compte ${document.numPages} pages, au-dela des ${PAGES_MAXIMUM} traitees.`,
      )
    }

    const pages: { png: Buffer; largeur: number; hauteur: number }[] = []
    let octets = 0

    for (let numero = 1; numero <= document.numPages; numero += 1) {
      const page = await document.getPage(numero)
      const vue = page.getViewport({ scale: RESOLUTION / POINTS_PAR_POUCE })
      const { toile, ctx } = toileBlanche(vue.width, vue.height)

      await page.render({
        canvas: enToileDom(toile),
        canvasContext: enContexteDom(ctx),
        viewport: vue,
      }).promise
      poserFiligrane(ctx, toile.width, toile.height, filigrane)

      // La page de sortie garde les dimensions de la page d'origine, en
      // points. Reprendre celles de la toile ferait un A4 de dix-sept pouces
      // de large : lisible a l'ecran, absurde a l'impression.
      const origine = page.getViewport({ scale: 1 })
      const png = toile.toBuffer('image/png')
      octets += png.length
      if (octets > 16 * 1024 * 1024) throw new Error('Sortie trop volumineuse')
      pages.push({
        png,
        largeur: origine.width,
        hauteur: origine.height,
      })
      toile.width = 1
      toile.height = 1
      page.cleanup()
    }

    return pages
  } finally {
    // Libere le worker, meme quand le document a fait echouer le rendu.
    await chargement.destroy()
  }
}

/** Une image deposee : une seule page, a sa taille. */
async function pageDeLImage(contenu: Buffer, filigrane: string) {
  const image = await loadImage(contenu)
  const { toile, ctx } = toileBlanche(image.width, image.height)

  ctx.drawImage(image, 0, 0)
  poserFiligrane(ctx, toile.width, toile.height, filigrane)

  return [
    {
      png: toile.toBuffer('image/png'),
      // Le PDF compte en points : une image de 150 ppp occupe sa taille reelle.
      largeur: (toile.width * POINTS_PAR_POUCE) / RESOLUTION,
      hauteur: (toile.height * POINTS_PAR_POUCE) / RESOLUTION,
    },
  ]
}

/**
 * Rasterise une piece et y pose un filigrane.
 *
 * Rend toujours un PDF, quelle que soit l'entree : l'agence recoit une seule
 * forme, et n'a pas a savoir ce que le garant avait sous la main.
 */
export async function rasteriser(
  contenu: Buffer,
  typeReel: TypeAccepte,
  filigrane: string,
): Promise<Buffer> {
  await verifierDocument(contenu, typeReel)
  const pages =
    typeReel === 'application/pdf'
      ? await pagesDuPdf(contenu, filigrane)
      : await pageDeLImage(contenu, filigrane)

  if (pages.length === 0) throw new Error('Ce document ne contient aucune page.')

  const sortie = await PDFDocument.create()

  for (const page of pages) {
    const image = await sortie.embedPng(page.png)
    const feuille = sortie.addPage([page.largeur, page.hauteur])
    feuille.drawImage(image, { x: 0, y: 0, width: page.largeur, height: page.hauteur })
  }

  return Buffer.from(await sortie.save())
}
