import assert from 'node:assert/strict'
import { resolve } from 'node:path'
export async function parcourirResponsable(page, site, id, collegue, moteur, largeur, simuler) {
  const url = `${site}/espace/dossiers/${id}`
  await page.goto(url)
  const section = page.locator('#responsable'),
    form = section.locator('form')
  await section
    .locator('p')
    .filter({ hasText: /^Non attribué$/ })
    .waitFor()
  await form.getByRole('combobox').selectOption(id)
  await form.getByRole('checkbox').check()
  await form.getByRole('button').focus()
  await page.keyboard.press('Enter')
  await section.getByText('Responsable enregistré.', { exact: true }).waitFor()
  await section
    .locator('p')
    .filter({ hasText: /^essai@example\.invalid$/ })
    .waitFor()
  await page.goto(`${site}/espace?responsable=mes&statut=complet`)
  await page.getByRole('table').getByText('OCRFICTIF', { exact: true }).waitFor()
  assert.equal(simuler.filtre().get('statut'), 'eq.complet', 'Filtre etat absent de la requete')
  assert.equal(simuler.filtre().get('affecte'), 'not.is.null', 'Filtre Mes dossiers absent')
  await page.goto(`${site}/espace?responsable=sans`)
  assert.equal(
    await page.getByRole('table').count(),
    0,
    'Dossier attribue dans la liste sans responsable',
  )
  await page.goto(url)
  simuler.conflit(true)
  await form.getByRole('combobox').selectOption(collegue)
  await form.getByRole('checkbox').check()
  await form.getByRole('button').click()
  await section.getByText('Affectation non enregistrée.', { exact: false }).waitFor()
  assert.equal(
    await section.getByText('Responsable enregistré.', { exact: true }).count(),
    0,
    'Faux succes responsable',
  )
  simuler.conflit(false)
  await form.getByRole('combobox').selectOption(collegue)
  await form.getByRole('checkbox').check()
  await form.getByRole('button').click()
  await section
    .locator('p')
    .filter({ hasText: /^collegue@example\.invalid$/ })
    .waitFor()
  simuler.role('membre')
  await page.goto(url)
  assert.equal(await form.count(), 0, 'Un collegue peut modifier une affectation tierce')
  await section
    .getByText('Le responsable actuel ou un administrateur peut libérer ce dossier.', {
      exact: true,
    })
    .waitFor()
  simuler.role('admin')
  await page.goto(url)
  await form.getByRole('combobox').selectOption('')
  await form.getByRole('checkbox').check()
  await form.getByRole('button').click()
  await section
    .locator('p')
    .filter({ hasText: /^Non attribué$/ })
    .waitFor()
  simuler.role('membre')
  await page.goto(url)
  await form.getByRole('checkbox').check()
  await form.getByRole('button', { name: 'M’attribuer ce dossier' }).click()
  await form.getByRole('button', { name: 'Libérer ce dossier' }).waitFor()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Debordement responsable mobile',
  )
  if (process.env.CLOISON_CAPTURE_RESPONSABLE_DIR)
    await page.screenshot({
      path: resolve(
        process.env.CLOISON_CAPTURE_RESPONSABLE_DIR,
        `responsable-${moteur.name()}-${largeur}.png`,
      ),
      fullPage: true,
    })
  await form.getByRole('checkbox').check()
  await form.getByRole('button', { name: 'Libérer ce dossier' }).click()
  await section
    .locator('p')
    .filter({ hasText: /^Non attribué$/ })
    .waitFor()
  await page.goto(`${site}/espace?responsable=sans`)
  await page.getByRole('table').getByText('OCRFICTIF', { exact: true }).waitFor()
  assert.equal(
    await page.evaluate(() => localStorage.length),
    0,
    'Affectation dans le stockage navigateur',
  )
  simuler.role('admin')
  console.log(
    `OK : responsable ${moteur.name()} ${largeur}, affectation, filtres, conflit, roles et liberation`,
  )
}
