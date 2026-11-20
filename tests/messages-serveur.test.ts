import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

import { messageDefaut, messagesServeur } from '@/lib/content/en/messages'
import { traducteur } from '@/lib/messages'
import { TAILLE_MAXIMALE, verifierContenu } from '@/lib/coffre/type-reel'

/**
 * Les messages que le serveur ecrit en francais ont tous une version anglaise.
 *
 * On relit les fichiers ou ces phrases naissent (actions, schemas, coffre) et
 * on y cherche les litteraux qui sont des phrases : chacun doit etre une cle du
 * dictionnaire. Sans ce test, une phrase ajoutee demain tomberait en silence
 * sur le message generique.
 */
const DOSSIERS = ['lib/agences', 'lib/garant', 'lib/locataire', 'lib/coffre']
const FICHIERS = DOSSIERS.flatMap((dossier) =>
  readdirSync(dossier)
    .filter((nom) => nom.endsWith('.ts'))
    .map((nom) => join(dossier, nom)),
).filter((fichier) => {
  const source = readFileSync(fichier, 'utf8')
  return (
    source.includes("from '@/lib/messages'") ||
    /lib\/coffre\/(type-reel|depot|ouverture)\.ts$/.test(fichier) ||
    fichier.endsWith('lib/agences/schema.ts')
  )
})

/** Une phrase adressee a une personne : des mots, une espace, un point final. */
const PHRASE = /^[A-ZÀ-Ý][^`$]*\s[^`$]*[.]$/

function phrases(source: string): string[] {
  // Les concatenations `'a ' + 'b.'` sont recollees avant la lecture.
  const recolle = source.replace(/(['"])\s*\+\s*\n?\s*(['"])/g, '')
  const trouvees: string[] = []
  for (const m of recolle.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
    const texte = (m[1] ?? m[2] ?? '').replace(/\\'/g, "'")
    if (PHRASE.test(texte)) trouvees.push(texte)
  }
  return trouvees
}

/** Ce qui est ecrit pour un journal ou une exception, jamais pour une personne. */
const INTERNES = new Set(['Echeance indisponible.'])

test('chaque fichier attendu est relu', () => {
  expect(FICHIERS.length).toBeGreaterThan(12)
})

test.each(FICHIERS)('%s : chaque message a sa version anglaise', (fichier) => {
  const source = readFileSync(fichier, 'utf8')
  const manquantes = phrases(source).filter(
    (phrase) =>
      !INTERNES.has(phrase) &&
      !(phrase in messagesServeur) &&
      !new RegExp(
        `(throw new Error|console\\.\\w+)\\(\\s*['"]${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ).test(source),
  )
  expect(manquantes).toEqual([])
})

test('le message de taille, compose a l’execution, est traduit', () => {
  const verdict = verifierContenu(Buffer.alloc(TAILLE_MAXIMALE + 1))
  expect(verdict.accepte).toBe(false)
  if (!verdict.accepte) expect(verdict.raison in messagesServeur).toBe(true)
})

test('le traducteur laisse le francais intact et ne rend jamais de francais en anglais', () => {
  expect(traducteur('fr')('Session expirée.')).toBe('Session expirée.')
  expect(traducteur('en')('Session expirée.')).toBe('Your session has expired.')
  expect(traducteur('en')('Une phrase inconnue.')).toBe(messageDefaut)
})
