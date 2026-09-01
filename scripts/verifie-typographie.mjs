#!/usr/bin/env node
/**
 * Garde-fou : ni emoji, ni tiret cadratin, nulle part.
 *
 * Deux regles de style que le depot tient, et qu'une relecture humaine finit
 * toujours par laisser passer :
 *
 *   1. AUCUN EMOJI. Un emoji est dessine par le systeme d'exploitation : il
 *      change de forme et de couleur d'un appareil a l'autre, ignore la charte,
 *      et refuse de suivre la couleur du texte qui l'entoure. Quand il faut une
 *      icone, elle se dessine en SVG dans `components/ui/Icone.tsx`, sur la
 *      meme grammaire que le reste du site.
 *
 *   2. AUCUN TIRET CADRATIN, cadratin ou demi-cadratin. En francais, ce que
 *      le cadratin exprime se dit avec des deux-points, une virgule ou des
 *      parentheses, et le texte y gagne en precision : le cadratin laisse au
 *      lecteur le soin de deviner quel lien logique on avait en tete.
 *
 * Ce n'est pas une preference de mise en forme, c'est une regle opposable :
 * elle tourne dans `npm run check` et dans la CI, donc elle ne depend pas de la
 * vigilance de celui qui relit.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const racine = process.cwd()

/** Repertoires jamais inspectes : rien de tout cela n'est ecrit a la main. */
const REPERTOIRES_IGNORES = new Set(['node_modules', '.next', '.git', 'out', 'coverage'])

/**
 * Fichiers exclus nommement.
 *
 * `design/home.artifact.html` est l'artefact d'origine du design, conserve tel
 * qu'il a ete produit. Le reecrire reviendrait a falsifier une archive.
 */
const FICHIERS_IGNORES = new Set(['design/home.artifact.html', 'package-lock.json'])

/** Seuls les formats ou l'on ecrit du texte a la main. */
const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.md',
  '.mdx',
  '.sql',
  '.json',
  '.txt',
  '.html',
  '.yml',
  '.yaml',
])

// Ecrits en echappement : ce script doit passer son propre controle.
const CADRATINS = /[\u2014\u2013]/gu
/**
 * Emojis et pictogrammes decoratifs.
 *
 * Volontairement large sur les blocs emoji, et volontairement muet sur la
 * ponctuation technique qui n'a rien d'un emoji : la fleche `→`, le point
 * median `·`, les guillemets francais, les puces de liste.
 */
const EMOJIS =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu
const PONCTUATION_ADMISE = new Set(['→', '←', '↑', '↓', '⌘'])

function* fichiers(repertoire) {
  for (const entree of readdirSync(repertoire)) {
    if (REPERTOIRES_IGNORES.has(entree)) continue
    const chemin = join(repertoire, entree)
    if (statSync(chemin).isDirectory()) {
      yield* fichiers(chemin)
    } else if (EXTENSIONS.has(extname(entree))) {
      yield chemin
    }
  }
}

const fautes = []

for (const chemin of fichiers(racine)) {
  const relatif = relative(racine, chemin).split('\\').join('/')
  if (FICHIERS_IGNORES.has(relatif)) continue

  const lignes = readFileSync(chemin, 'utf8').split('\n')

  lignes.forEach((ligne, index) => {
    for (const trouve of ligne.matchAll(CADRATINS)) {
      fautes.push({
        relatif,
        ligne: index + 1,
        quoi: `tiret cadratin \`${trouve[0]}\``,
        extrait: ligne.trim(),
      })
    }
    for (const trouve of ligne.matchAll(EMOJIS)) {
      if (PONCTUATION_ADMISE.has(trouve[0])) continue
      fautes.push({
        relatif,
        ligne: index + 1,
        quoi: `emoji \`${trouve[0]}\``,
        extrait: ligne.trim(),
      })
    }
  })
}

if (fautes.length === 0) {
  console.log('\nTypographie : rien a signaler.\n')
  process.exit(0)
}

console.error(`\n${fautes.length} occurrence(s) a corriger :\n`)
for (const faute of fautes.slice(0, 40)) {
  console.error(`  ${faute.relatif}:${faute.ligne}  ${faute.quoi}`)
  console.error(`    ${faute.extrait.slice(0, 100)}`)
}
if (fautes.length > 40) console.error(`  ... et ${fautes.length - 40} autres.`)

console.error(
  '\nUn cadratin se remplace par des deux-points, une virgule ou des parentheses.' +
    '\nUn emoji se remplace par une icone de `components/ui/Icone.tsx`.\n',
)
process.exit(1)
