#!/usr/bin/env node
/**
 * Tire les PNG et le favicon ICO du kit de marque a partir des SVG maitres.
 *
 * A lancer apres `python3 scripts/marque/generer-svg.py`, depuis la racine :
 *
 *   node scripts/marque/rasteriser.mjs
 *
 * Le rendu passe par Chromium (Playwright, deja en dependance de dev) : chaque
 * taille est dessinee directement depuis le vecteur, sans reduire une grande
 * image, pour que le 16 px reste net.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const racine = process.cwd()
const marque = join(racine, 'public', 'brand')
const icones = join(racine, 'public', 'icones')
mkdirSync(icones, { recursive: true })

// CHROMIUM_PATH permet de pointer un Chromium deja installe si la version
// attendue par Playwright n'est pas presente.
const navigateur = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
const page = await navigateur.newPage({ deviceScaleFactor: 1 })

/** Dessine un SVG a la taille demandee et renvoie le PNG (fond transparent conserve). */
async function rendre(svg, largeur, hauteur) {
  await page.setViewportSize({ width: largeur, height: hauteur })
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      `<img src="${source}" width="${largeur}" height="${hauteur}" style="display:block"></body></html>`,
  )
  await page.locator('img').evaluate((img) => img.decode())
  return page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: largeur, height: hauteur },
  })
}

function dimensions(svg) {
  const [, , l, h] = svg
    .match(/viewBox="([^"]+)"/)[1]
    .split(' ')
    .map(Number)
  return { l, h }
}

// 1. Chaque declinaison du logo en PNG, a la taille de son SVG.
for (const fichier of readdirSync(marque).filter((f) => f.endsWith('.svg'))) {
  if (fichier.includes('symbole') || fichier.includes('favicon')) continue
  const svg = readFileSync(join(marque, fichier), 'utf8')
  const { l, h } = dimensions(svg)
  writeFileSync(join(marque, fichier.replace('.svg', '.png')), await rendre(svg, l, h))
}

const symbole = readFileSync(join(marque, 'cloison-symbole.svg'), 'utf8')
const plein = readFileSync(join(marque, 'cloison-symbole-plein.svg'), 'utf8')

// 2. Le symbole pour les profils (avatar carre plein) et l'usage libre.
writeFileSync(join(marque, 'cloison-symbole.png'), await rendre(symbole, 1024, 1024))
writeFileSync(join(marque, 'cloison-avatar.png'), await rendre(plein, 1024, 1024))

// 3. Icones d'application : `any` arrondie, `maskable` pleine (le systeme decoupe).
for (const taille of [16, 32, 48, 192, 512]) {
  writeFileSync(join(icones, `icone-${taille}.png`), await rendre(symbole, taille, taille))
}
writeFileSync(join(icones, 'icone-masquable-512.png'), await rendre(plein, 512, 512))

// 4. apple-touch-icon : carre plein, iOS arrondit lui-meme et refuse la transparence.
writeFileSync(join(racine, 'app', 'apple-icon.png'), await rendre(plein, 180, 180))

// 5. favicon.ico : 16, 32 et 48 px, chacun en PNG embarque (format admis depuis Vista).
const images = await Promise.all([16, 32, 48].map(async (t) => [t, await rendre(symbole, t, t)]))
const entete = Buffer.alloc(6 + 16 * images.length)
entete.writeUInt16LE(0, 0)
entete.writeUInt16LE(1, 2)
entete.writeUInt16LE(images.length, 4)
let decalage = entete.length
images.forEach(([taille, png], i) => {
  const e = 6 + 16 * i
  entete.writeUInt8(taille, e)
  entete.writeUInt8(taille, e + 1)
  entete.writeUInt8(0, e + 2)
  entete.writeUInt8(0, e + 3)
  entete.writeUInt16LE(1, e + 4)
  entete.writeUInt16LE(32, e + 6)
  entete.writeUInt32LE(png.length, e + 8)
  entete.writeUInt32LE(decalage, e + 12)
  decalage += png.length
})
writeFileSync(
  join(racine, 'app', 'favicon.ico'),
  Buffer.concat([entete, ...images.map(([, p]) => p)]),
)

await navigateur.close()
console.log('PNG et ICO ecrits dans public/brand, public/icones et app/')
