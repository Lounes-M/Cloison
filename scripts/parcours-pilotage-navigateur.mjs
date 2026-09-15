import assert from 'node:assert/strict'

export async function parcourirPilotage(page, site, id, moteur, largeur, simuler) {
  await page.goto(`${site}/espace`)
  const priorites = page.getByRole('region', { name: 'Vos priorités' })
  await priorites.getByRole('link', { name: /À examiner/ }).waitFor()
  assert.match(await priorites.getByRole('link', { name: /À examiner/ }).innerText(), /1/)
  const section = page.locator('#attributions')
  await section.getByLabel('OCRFICTIF', { exact: true }).check()
  await section.getByRole('combobox').selectOption(id)
  await section.getByLabel('Je confirme l’affectation des dossiers sélectionnés.').check()
  await section.getByRole('button').focus()
  await page.keyboard.press('Enter')
  await section
    .getByRole('status')
    .getByText('OCRFICTIF : Affectation confirmée', { exact: true })
    .waitFor()
  assert(
    await section.getByRole('button').isDisabled(),
    'Une selection terminee peut etre renvoyee',
  )
  await page.reload()
  await section.getByLabel('OCRFICTIF', { exact: true }).check()
  simuler.conflit(true)
  await section.getByRole('combobox').selectOption('')
  await section.getByLabel('Je confirme l’affectation des dossiers sélectionnés.').check()
  await section.getByRole('button').click()
  await section
    .getByRole('status')
    .getByText('OCRFICTIF : Refusé : actualisez le dossier', { exact: true })
    .waitFor()
  simuler.conflit(false)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  console.log(
    `OK : pilotage ${moteur.name()} ${largeur}, compteurs, affectation clavier, conflit et bilan`,
  )
}
