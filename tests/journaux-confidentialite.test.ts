import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

// Contrat volontairement restrictif : un evenement applicatif est un libelle
// constant, jamais une erreur fournisseur, un identifiant ou un contenu saisi.
function violations(source: string, nom = 'fixture.tsx'): number[] {
  const arbre = ts.createSourceFile(nom, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lignes: number[] = []
  function constante(n: ts.Node): boolean {
    return (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      (ts.isConditionalExpression(n) && constante(n.whenTrue) && constante(n.whenFalse))
    )
  }
  function visiter(n: ts.Node) {
    if (ts.isIdentifier(n) && n.text === 'console') {
      const acces = n.parent
      const appel = acces.parent
      const direct =
        (ts.isPropertyAccessExpression(acces) || ts.isElementAccessExpression(acces)) &&
        acces.expression === n &&
        ts.isCallExpression(appel) &&
        appel.expression === acces
      if (!direct || appel.arguments.length === 0 || !appel.arguments.every(constante)) {
        lignes.push(arbre.getLineAndCharacterOfPosition(n.getStart()).line + 1)
      }
    }
    ts.forEachChild(n, visiter)
  }
  visiter(arbre)
  return lignes
}

for (const source of [
  'console.error(error)',
  "console.error('[coffre] echec', piece.chemin, error)",
  'console.warn(`Erreur ${email}`)',
  "console.log('[acces] ' + jeton)",
  "console['error']({ message: erreur.message })",
  'const journal = console; journal.error(secret)',
  'const { error } = console; error(secret)',
  'console.error.bind(console)(secret)',
]) {
  test(`refuse une donnee dynamique dans un journal : ${source}`, () => {
    expect(violations(source).length).toBeGreaterThan(0)
  })
}

test('accepte les libelles constants et les categories finies', () => {
  expect(violations("console.error(echec ? '[coffre] refuse' : '[coffre] indisponible')")).toEqual(
    [],
  )
  expect(violations("console['warn']('[acces] refuse')")).toEqual([])
})

function fichiers(repertoire: string): string[] {
  return readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(repertoire, entree.name)
    return entree.isDirectory() ? fichiers(chemin) : /\.[cm]?[jt]sx?$/.test(chemin) ? [chemin] : []
  })
}

test('les journaux applicatifs ne recoivent aucune donnee dynamique', () => {
  const racine = process.cwd()
  const chemins = ['app', 'lib', 'components'].flatMap((d) => fichiers(join(racine, d)))
  chemins.push(join(racine, 'middleware.ts'))
  const fautes = chemins.flatMap((p) =>
    violations(readFileSync(p, 'utf8'), p).map((ligne) => `${relative(racine, p)}:${ligne}`),
  )
  expect(fautes, 'Donnees dynamiques ou alias console interdits dans le code applicatif').toEqual(
    [],
  )
})
