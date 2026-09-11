import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
export async function parcourirHistoriqueResponsables(page, site, id, moteur, largeur, simuler) {
  const url = `${site}/espace/dossiers/${id}`
  await page.goto(url)
  const section = page.locator('#historique-responsables'),
    summary = section.locator('summary')
  await summary.focus()
  await page.keyboard.press('Enter')
  assert((await section.locator('li').count()) > 0, 'Affectations absentes de l historique')
  await section.locator('li').first().waitFor()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Debordement de l historique',
  )
  if (process.env.CLOISON_CAPTURE_HISTORIQUE_DIR)
    await section.screenshot({
      path: resolve(
        process.env.CLOISON_CAPTURE_HISTORIQUE_DIR,
        `historique-${moteur.name()}-${largeur}.png`,
      ),
      animations: 'disabled',
    })
  const lignes = Array.from({ length: 55 }, (_, i) => ({
    id: randomUUID(),
    quand: new Date(Date.now() - i * 1000).toISOString(),
    precedent: null,
    precedent_email: null,
    suivant: randomUUID(),
    suivant_email: `collaborateur-${i}@example.invalid`,
    auteur: null,
    auteur_email: null,
  }))
  simuler.donnees(lignes)
  await page.goto(url)
  await summary.focus()
  await page.keyboard.press('Enter')
  assert.equal(await section.locator('li').count(), 50)
  await Promise.all([
    page.waitForURL((u) => u.searchParams.has('affectations'), { waitUntil: 'domcontentloaded' }),
    section.getByRole('link', { name: 'Changements précédents', exact: true }).click(),
  ])
  assert.equal(await section.getAttribute('open'), '', 'Le panneau pagine doit etre ouvert')
  await section.getByRole('link', { name: 'Changements les plus récents', exact: true }).waitFor()
  assert.equal(await section.locator('li').count(), 5)
  assert.equal(
    await section.getByText('collaborateur-0@example.invalid', { exact: false }).count(),
    0,
  )
  await section.getByText('collaborateur-54@example.invalid', { exact: false }).waitFor()
  simuler.panne(true)
  await page.goto(url)
  await summary.focus()
  await page.keyboard.press('Enter')
  await section
    .getByText('L’historique est momentanément indisponible.', { exact: false })
    .waitFor()
  assert.equal(await section.locator('li').count(), 0)
  assert.equal((await page.textContent('body')).includes('panne interne fictive'), false)
  await page.getByRole('heading', { name: 'Responsable du dossier', exact: true }).waitFor()
  simuler.panne(false)
  simuler.donnees([])
  console.log(
    `OK : historique ${moteur.name()} ${largeur}, clavier, pages, affectations et panne independante`,
  )
}
