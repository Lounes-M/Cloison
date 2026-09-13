import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const attendus = [
  'infra/documentaire/entree.mjs',
  'infra/documentaire/package.json',
  'infra/documentaire/package-lock.json',
  'workers/document.mjs',
  'workers/dimensions.ts',
  'workers/validation-document.ts',
  'workers/rasterisation.ts',
].sort()
const trouves = []
async function parcourir(racine, prefixe = '') {
  for (const entree of await readdir(join(racine, prefixe), { withFileTypes: true })) {
    assert(!entree.isSymbolicLink(), 'Lien dans le contexte refuse')
    const chemin = prefixe + entree.name
    if (entree.isDirectory()) await parcourir(racine, chemin + '/')
    else trouves.push(chemin)
  }
}
assert(process.argv.length === 3, 'Repertoire de contexte requis')
await parcourir(process.argv[2])
assert.deepEqual(trouves.sort(), attendus, 'Contexte documentaire non minimal')
console.log('OK : contexte limite aux sept fichiers attendus, fichiers prives exclus')
