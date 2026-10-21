import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// axe-core est injecte par le protocole du navigateur, hors CSP de la page :
// la politique servie reste intacte et aucun script tiers n'entre dans le build.
const source = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Regles WCAG 2.2 A et AA verifiables automatiquement, contrastes compris. */
export async function auditerAccessibilite(page, nom) {
  // Apres une action serveur, Next peut rendre le contenu avant de reposer le
  // titre du document : on audite la page une fois son titre en place.
  await page.waitForFunction(() => document.title.trim() !== '')
  // Les apparitions (fondu, revelation au defilement) sont menees a leur etat
  // final : un texte a mi-opacite fausserait le contraste d'un passage a l'autre.
  await page.evaluate(() => {
    for (const animation of document.getAnimations())
      if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish()
  })
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(source)
  const violations = await page.evaluate(async (normes) => {
    const resultat = await window.axe.run(document, {
      runOnly: { type: 'tag', values: normes },
      resultTypes: ['violations'],
    })
    return resultat.violations.map((v) => ({
      regle: v.id,
      impact: v.impact,
      cibles: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }))
  }, NORMES)
  assert.deepEqual(violations, [], `Accessibilite ${nom} : ${JSON.stringify(violations)}`)
}

/** Contre-preuve : l'audit doit refuser des defauts connus sur une page servie. */
export async function verifierDetectionAccessibilite(page) {
  await page.evaluate(() => {
    const essai = document.createElement('div')
    essai.id = 'essai-accessibilite'
    essai.innerHTML =
      '<button type="button"></button><input type="text"><p style="color:#bbb;background:#fff">Texte pale</p>'
    document.body.append(essai)
  })
  try {
    await assert.rejects(auditerAccessibilite(page, 'contre-preuve'), (e) =>
      ['button-name', 'label', 'color-contrast'].every((regle) => e.message.includes(regle)),
    )
  } finally {
    await page.evaluate(() => document.getElementById('essai-accessibilite')?.remove())
  }
  await auditerAccessibilite(page, 'apres contre-preuve')
  console.log(
    'OK : audit d accessibilite, bouton sans nom, champ sans etiquette et contraste refuses',
  )
}
