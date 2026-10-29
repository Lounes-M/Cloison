import { readdirSync, readFileSync } from 'node:fs'
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
  /(?<![\p{L}_/-])(deja|memes?|tres|apres|etre|pieces?|depots?|privee?s?|precedente?s?|verifiee?s?|verifier|solidarite|securite|acces|echeances?|references?|cles?|delais?|donnees?|identite|telecharger?|reponses?|numeros?|etapes?|etat|equipes?|reessaie|reessayez|operations?|categories?|controler?|dernieres?|premieres?|desormais|systemes?|regles?|reglements?|expirees?|decimales?|depasse|legere?|plutot|videos?|deposer|depose)(?![\p{L}_])/giu

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
  'rattachement',
  'responsables',
]
const TUTOIEMENT = /(?<![\p{L}_’'-])(tu|ton|ta|tes|toi|te)(?![\p{L}_])/giu
/**
 * Le tutoiement qui ne passe pas par un pronom : l'elision (« t’a désigné »),
 * les imperatifs sans equivoque et l'imperatif suivi d'un pronom
 * (« Exporte-le », quand le vouvoiement ecrit « Exportez-le »).
 */
const IMPERATIF =
  /(?<![\p{L}_])(réessaie|choisis|saisis|réduis|reprends|reviens|lis)(?![\p{L}_])|\p{L}*[^z\s’'-]-(le|la|les)(?![\p{L}_])|(?<![\p{L}_])t[’'](?=\p{L})/giu
const tutoie = (texte: string) => Boolean(texte.match(TUTOIEMENT) || texte.match(IMPERATIF))

/**
 * Les textes lus par le garant, qui se vouvoie aussi : des modules entiers, et
 * les branches propres au garant dans les modules partages avec le locataire.
 */
const GARANT = [
  'brouillons',
  'conditions-engagement',
  'garant',
  'journal',
  'remise-droits',
  'reutilisation',
  'session-porteur',
  'signature',
]
const BRANCHES_GARANT = [
  'complements.complements.aideGarant',
  'courriels.garant.',
  'courriels.cloture.garant.',
  'information-collecte.informationCollecte.garant',
  'interface.interfaceEspace.roles[1]',
  'liens.liens.garant.',
  'locataire.lienInvalide.garant',
  'rappels.courrielsRappels.depot.',
  'support-dossier.aideDossier.aide:',
  'support-dossier.aideDossier.confidentialite:',
  'support-dossier.aideDossier.copie:',
]

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
      if (tutoie(phrase.slice(phrase.indexOf(': ')))) fautes.push(phrase)
  expect(fautes).toEqual([])
})

test('les textes du garant le vouvoient', async () => {
  for (const nom of GARANT) expect(modules).toContain(nom)
  const lues = [
    ...(await Promise.all(GARANT.map(lire))).flat(),
    ...(await Promise.all(modules.map(lire)))
      .flat()
      .filter((phrase) => BRANCHES_GARANT.some((branche) => phrase.startsWith(branche))),
  ]
  // Chaque branche nommee doit exister : un renommage la ferait sortir de la garde.
  for (const branche of BRANCHES_GARANT)
    expect(lues.some((phrase) => phrase.startsWith(branche))).toBe(true)
  expect(lues.filter((phrase) => tutoie(phrase.slice(phrase.indexOf(': '))))).toEqual([])
})

/**
 * Les messages d'erreur rendus par les actions, ecrits a cote du code.
 *
 * Ils s'affichent comme le reste mais echappaient a la garde de
 * `lib/content` : on lit donc chaque litteral pose sous `message:` ou
 * `raison:`, ou dans une constante, dans les dossiers qui parlent aux personnes.
 */
const MESSAGES = ['lib/agences', 'lib/garant', 'lib/locataire', 'lib/coffre']
// Un litteral peut etre renvoye a la ligne apres sa cle, ou coupe en plusieurs
// morceaux joints par `+` : on lit toute la chaine.
const MORCEAU = `(?:'[^'\\n]*'|"[^"\\n]*")`
const LITTERAL = new RegExp(
  `(?:\\b(?:message|raison):\\s*|\\bconst [A-Z_]+ = )(${MORCEAU}(?:\\s*\\+\\s*${MORCEAU})*)`,
  'g',
)
const recoller = (chaine: string) =>
  [...chaine.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]).join('')

function messages(dossier: string) {
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.ts'))
    .flatMap((f) =>
      [...readFileSync(`${dossier}/${f}`, 'utf8').matchAll(LITTERAL)]
        .map((m) => recoller(m[1] ?? ''))
        .filter((texte) => texte.includes(' '))
        .map((texte) => `${dossier}/${f}: ${texte}`),
    )
}

test('les messages des actions gardent leurs accents', () => {
  const lus = MESSAGES.flatMap(messages)
  expect(lus.length).toBeGreaterThan(40)
  expect(lus.filter((m) => m.slice(m.indexOf(': ')).match(SANS_ACCENT))).toEqual([])
})

test('les messages de l agence et du garant vouvoient', () => {
  // Le locataire est le seul tutoye : lib/locataire reste hors de cette garde.
  const lus = ['lib/agences', 'lib/garant', 'lib/coffre'].flatMap(messages)
  expect(lus.filter((m) => tutoie(m.slice(m.indexOf(': '))))).toEqual([])
})

test('les deux gardes reconnaissent les fautes qu elles visent', () => {
  expect('Dépose un fichier de la meme catégorie.').toMatch(SANS_ACCENT)
  expect('Ton depot reste prive.').toMatch(SANS_ACCENT)
  expect('Dépose un fichier de la même catégorie.').not.toMatch(SANS_ACCENT)
  expect('Importe-le dans ton agenda.').toMatch(TUTOIEMENT)
  expect('Importez-le dans votre agenda, puis tenez-le à jour.').not.toMatch(TUTOIEMENT)
  expect(tutoie('locataire@exemple.fr t’a désigné comme garant.')).toBe(true)
  expect(tutoie('Exporte-le en PDF.')).toBe(true)
  expect(tutoie('Réessaie dans un instant.')).toBe(true)
  expect(tutoie('Exportez-le en PDF, puis réessayez. Peut-être plus tard.')).toBe(false)
})
