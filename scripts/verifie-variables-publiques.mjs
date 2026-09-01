#!/usr/bin/env node
/**
 * Garde-fou : empeche un secret de partir dans le bundle navigateur.
 *
 * Sous Next, deux mecanismes exposent une variable au client : le prefixe
 * `NEXT_PUBLIC_`, et le bloc `env` de `next.config.ts`. Les deux substituent la
 * valeur au build : elle devient lisible par n'importe qui via « afficher le
 * code source ». Rien ne signale l'erreur, le site fonctionne parfaitement.
 *
 * Ce script verifie trois choses :
 *
 *   1. le bloc `env` de `next.config.ts` ne contient que des cles autorisees ;
 *   2. aucune variable `NEXT_PUBLIC_*` du code ne porte un nom de secret ;
 *   3. aucune valeur de variable sensible presente dans l'environnement ne se
 *      retrouve dans les fichiers servis au navigateur.
 *
 * La troisieme est la seule qui constate une fuite reelle ; elle a besoin d'un
 * build et se met en pause s'il n'y en a pas.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Les seules cles admises dans le bloc `env` de `next.config.ts`.
 * En ajouter une ici est une decision : cela rend sa valeur publique.
 */
const CLES_PUBLIQUES_AUTORISEES = new Set(['NEXT_PUBLIC_SITE_URL'])

/** Un nom contenant l'un de ces mots ne doit jamais etre expose au client. */
const MOTS_SENSIBLES =
  /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API[_-]?KEY|_KEY$|SIGNING|SALT|CERT|DSN)/i

/** En deca, une valeur est trop courte pour etre cherchee sans faux positifs. */
const LONGUEUR_MINIMALE_VALEUR = 8

const erreurs = []
const avertissements = []
let ignorees = 0

// ---------------------------------------------------------------------------
// 1. Le bloc `env` de next.config.ts
// ---------------------------------------------------------------------------

const cheminConfig = join(racine, 'next.config.ts')
const config = readFileSync(cheminConfig, 'utf8')

const debut = config.indexOf('env: {')
if (debut === -1) {
  avertissements.push('next.config.ts ne declare plus de bloc `env` : verification 1 sans objet.')
} else {
  const fin = config.indexOf('}', debut)
  const corps = config.slice(debut + 'env: {'.length, fin)
  const cles = [...corps.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1])

  for (const cle of cles) {
    if (!CLES_PUBLIQUES_AUTORISEES.has(cle)) {
      erreurs.push(
        `next.config.ts : la cle \`${cle}\` est declaree dans \`env\` sans figurer dans la liste ` +
          `des cles publiques autorisees.\n` +
          `    Tout ce qui passe par ce bloc est substitue au build et peut finir dans le bundle ` +
          `navigateur.\n` +
          `    Si la valeur est publique, ajoute \`${cle}\` a CLES_PUBLIQUES_AUTORISEES dans ce ` +
          `script.\n` +
          `    Sinon, lis-la cote serveur via process.env, sans passer par \`env\`.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Les noms de variables NEXT_PUBLIC_* utilises dans le code
// ---------------------------------------------------------------------------

const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.jsx']
const DOSSIERS_IGNORES = new Set(['node_modules', '.next', '.git', 'design', 'public', 'assets'])

function* fichiersSource(dossier) {
  for (const entree of readdirSync(dossier)) {
    if (DOSSIERS_IGNORES.has(entree)) continue
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) {
      yield* fichiersSource(chemin)
    } else if (EXTENSIONS.some((ext) => entree.endsWith(ext))) {
      yield chemin
    }
  }
}

for (const fichier of fichiersSource(racine)) {
  const contenu = readFileSync(fichier, 'utf8')
  for (const trouve of contenu.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
    const nom = trouve[0]
    if (MOTS_SENSIBLES.test(nom)) {
      erreurs.push(
        `${relative(racine, fichier)} : \`${nom}\` porte un nom de secret ET le prefixe ` +
          `\`NEXT_PUBLIC_\`.\n` +
          `    Ce prefixe rend la valeur publique. Retire-le et lis la variable cote serveur.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Fuite reelle dans les fichiers servis au navigateur
// ---------------------------------------------------------------------------

const dossierStatic = join(racine, '.next', 'static')

if (!existsSync(dossierStatic)) {
  avertissements.push(
    'Pas de build trouve : verification 3 (fuite reelle dans le bundle) non executee.\n' +
      '    Lance `npm run build` puis relance ce script pour l’inclure.',
  )
} else {
  const candidats = Object.entries(process.env).filter(
    ([nom, valeur]) =>
      MOTS_SENSIBLES.test(nom) &&
      !nom.startsWith('NEXT_PUBLIC_') &&
      typeof valeur === 'string' &&
      valeur.length >= LONGUEUR_MINIMALE_VALEUR,
  )

  ignorees = Object.keys(process.env).length - candidats.length

  if (candidats.length === 0) {
    avertissements.push(
      'Aucune variable sensible dans l’environnement : verification 3 executee a vide.\n' +
        '    Elle prendra tout son sens quand le projet aura de vrais secrets.',
    )
  } else {
    const fichiersClients = []
    const parcours = (dossier) => {
      for (const entree of readdirSync(dossier)) {
        const chemin = join(dossier, entree)
        if (statSync(chemin).isDirectory()) parcours(chemin)
        else fichiersClients.push(chemin)
      }
    }
    parcours(dossierStatic)

    for (const chemin of fichiersClients) {
      let contenu
      try {
        contenu = readFileSync(chemin, 'utf8')
      } catch {
        continue // binaire (police, image) : rien a y chercher
      }
      for (const [nom, valeur] of candidats) {
        if (contenu.includes(valeur)) {
          erreurs.push(
            `FUITE : la valeur de \`${nom}\` apparait dans ${relative(racine, chemin)}.\n` +
              `    Ce fichier est servi au navigateur : ce secret est compromis.\n` +
              `    Fais-le tourner, puis retire la variable du code client.`,
          )
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

for (const message of avertissements) {
  console.log(`  note : ${message}`)
}

if (erreurs.length > 0) {
  console.error(`\n${erreurs.length} probleme(s) de variables publiques :\n`)
  for (const erreur of erreurs) console.error(`  - ${erreur}\n`)
  process.exit(1)
}

console.log(
  `\nVariables publiques : rien a signaler` +
    (ignorees ? ` (${ignorees} variables d’environnement non sensibles ignorees).` : '.'),
)
