import { readdirSync } from 'node:fs'
import { expect, test } from 'vitest'

/**
 * La redaction des textes affiches, verifiee sur tout `lib/content`.
 *
 * Deux fautes qu'aucune relecture ne rattrape a coup sur, parce qu'elles ne
 * cassent rien : un mot francais sans ses accents (« depot », « meme »), et le
 * tutoiement dans un ecran d'agence, qui se vouvoie. Les deux ont ete trouvees
 * en production de textes, pas en theorie.
 *
 * Seules les phrases sont lues (une valeur avec une espace) : les cles, les
 * identifiants et les chemins sont ecrits sans accents a dessein.
 */

/** Des formes qui n'existent pas en francais : chacune a perdu un accent. */
const SANS_ACCENT =
  /(?<![\p{L}_/-])(deja|memes?|tres|apres|etre|pieces?|depots?|privee?s?|precedente?s?|verifiee?s?|verifier|solidarite|securite|acces|echeances?|references?|cles?|delais?|donnees?|identite|telecharger?|reponses?|numeros?|etapes?|etat|equipes?|reessaie|reessayez|operations?|categories?|controler?|dernieres?|premieres?|desormais|systemes?|regles?|reglements?)(?![\p{L}_])/giu

/** Les modules lus uniquement dans l'espace agence, qui vouvoie. */
const AGENCE = [
  'application-secours',
  'calendrier',
  'collaborateurs',
  'connecteurs',
  'examen',
  'exports-registres',
  'facturation',
  'historique-responsables',
  'pilotage',
  'preferences',
  'responsables',
]
const TUTOIEMENT = /(?<![\p{L}_’'-])(tu|ton|ta|tes|toi|te)(?![\p{L}_])/giu

function phrases(valeur: unknown, sortie: string[], chemin: string) {
  if (typeof valeur === 'string') {
    if (valeur.includes(' ')) sortie.push(`${chemin}: ${valeur}`)
  } else if (typeof valeur === 'function') {
    // Les gabarits rendent une phrase a partir de valeurs neutres.
    let rendu: unknown
    try {
      rendu = (valeur as (...a: unknown[]) => unknown)('X', 2, 'Y', 3)
    } catch {
      return
    }
    phrases(rendu, sortie, `${chemin}()`)
  } else if (Array.isArray(valeur)) {
    valeur.forEach((v, i) => phrases(v, sortie, `${chemin}[${i}]`))
  } else if (valeur && typeof valeur === 'object') {
    for (const [cle, v] of Object.entries(valeur)) phrases(v, sortie, `${chemin}.${cle}`)
  }
}

async function lire(nom: string) {
  const sortie: string[] = []
  phrases(await import(`@/lib/content/${nom}.ts`), sortie, nom)
  return sortie
}

const modules = readdirSync('lib/content')
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.slice(0, -3))

test('aucun texte affiche ne perd ses accents', async () => {
  const fautes: string[] = []
  for (const nom of modules)
    for (const phrase of await lire(nom))
      if (phrase.slice(phrase.indexOf(': ')).match(SANS_ACCENT)) fautes.push(phrase)
  expect(fautes).toEqual([])
})

test('les ecrans d agence vouvoient', async () => {
  for (const nom of AGENCE) expect(modules).toContain(nom)
  const fautes: string[] = []
  for (const nom of AGENCE)
    for (const phrase of await lire(nom))
      if (phrase.slice(phrase.indexOf(': ')).match(TUTOIEMENT)) fautes.push(phrase)
  expect(fautes).toEqual([])
})

test('les deux gardes reconnaissent les fautes qu elles visent', () => {
  expect('Dépose un fichier de la meme catégorie.').toMatch(SANS_ACCENT)
  expect('Ton depot reste prive.').toMatch(SANS_ACCENT)
  expect('Dépose un fichier de la même catégorie.').not.toMatch(SANS_ACCENT)
  expect('Importe-le dans ton agenda.').toMatch(TUTOIEMENT)
  expect('Importez-le dans votre agenda, puis tenez-le à jour.').not.toMatch(TUTOIEMENT)
})
