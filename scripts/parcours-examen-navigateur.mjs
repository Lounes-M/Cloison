import assert from 'node:assert/strict'

export async function parcourirExamen(page, site, id, moteur, largeur, conflit) {
  await page.goto(`${site}/espace/dossiers/${id}`)
  const resume = page.locator('summary').filter({ hasText: 'Examen humain du document' })
  await resume.click()
  const formulaire = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Enregistrer l’examen' }) })
  await formulaire.getByRole('combobox').selectOption('examine')
  await formulaire.getByRole('button').click()
  assert(
    await formulaire.getByRole('checkbox').evaluate((e) => e.validity.valueMissing),
    'Examen sans confirmation',
  )
  await formulaire.getByRole('checkbox').check()
  await formulaire.getByRole('button').focus()
  await page.keyboard.press('Enter')
  await page.getByText('Examen enregistré.', { exact: true }).waitFor()
  await page
    .getByText('Examen humain du document : Examiné : lisible et complet', { exact: true })
    .waitFor()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Debordement examen mobile',
  )
  await page.reload()
  await page
    .getByText('Examen humain du document : Examiné : lisible et complet', { exact: true })
    .waitFor()
  await resume.click()
  conflit(true)
  await formulaire.getByRole('combobox').selectOption('a_revoir')
  await formulaire.getByRole('checkbox').check()
  await formulaire.getByRole('button').click()
  await page.getByText('Examen non enregistré.', { exact: false }).waitFor()
  assert.equal(
    await page.getByText('Examen enregistré.', { exact: true }).count(),
    0,
    'Faux succes examen',
  )
  conflit(false)
  await formulaire.getByRole('combobox').selectOption('a_revoir')
  await formulaire.getByRole('checkbox').check()
  await formulaire.getByRole('button').click()
  await page.getByText('Examen humain du document : À revoir', { exact: true }).waitFor()
  assert.equal(
    await page.evaluate(() => localStorage.length),
    0,
    'Examen conserve dans le navigateur',
  )
  console.log(
    `OK : examen ${moteur.name()} ${largeur}, confirmation, clavier, persistance et conflit`,
  )
}
