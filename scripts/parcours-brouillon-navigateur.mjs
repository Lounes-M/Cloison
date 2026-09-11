import assert from 'node:assert/strict'
export async function parcourirBrouillon(page, site, moteur, largeur, fixture) {
  fixture.reinitialiser()
  await page.goto(site + '/garant')
  const revenu = page.locator('input[name="revenu"]')
  const sauver = page.getByRole('button', { name: 'Garder cette saisie en brouillon', exact: true })
  await revenu.fill('1234,56')
  await page.locator('input[name="montant"]').fill('1200')
  await sauver.click()
  await page.getByRole('status').filter({ hasText: 'Brouillon sauvegardé.' }).waitFor()
  assert.equal(
    await revenu.inputValue(),
    '1234,56',
    'La sauvegarde ne reinitialise pas le formulaire',
  )
  assert(fixture.lire().chiffre.startsWith('\\x'))
  assert(!Buffer.from(fixture.lire().chiffre.slice(2), 'hex').toString().includes('1234,56'))
  await page.reload()
  assert.equal(await revenu.inputValue(), '', 'Pas de reprise implicite')
  await page.getByRole('button', { name: 'Reprendre mon brouillon', exact: true }).click()
  const confirmer = page.getByRole('button', {
    name: 'Remplacer ma saisie par le brouillon',
    exact: true,
  })
  await confirmer.waitFor()
  assert.equal(await revenu.inputValue(), '')
  await confirmer.focus()
  await page.keyboard.press('Enter')
  assert.equal(await revenu.inputValue(), '1234,56')
  const autre = await page.context().newPage()
  try {
    await autre.goto(site + '/garant')
    await autre.locator('input[name="revenu"]').fill('9999')
    await autre
      .getByRole('button', { name: 'Garder cette saisie en brouillon', exact: true })
      .click()
    await autre
      .getByRole('alert')
      .filter({ hasText: 'Le dossier ou le brouillon a changé.' })
      .waitFor()
    assert.equal(await autre.locator('input[name="revenu"]').inputValue(), '9999')
  } finally {
    await autre.close()
  }
  await page.getByRole('button', { name: 'Supprimer mon brouillon', exact: true }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Le contenu de ton brouillon a été supprimé.' })
    .waitFor()
  assert.equal(fixture.lire().chiffre, null)
  assert.equal(
    await revenu.inputValue(),
    '1234,56',
    'La suppression du brouillon preserve la saisie courante',
  )
  await page.reload()
  await page.getByRole('button', { name: 'Reprendre mon brouillon', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Aucun brouillon enregistré.' }).waitFor()
  assert.equal(await confirmer.count(), 0)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  console.log(
    `OK : brouillon ${moteur.name()} ${largeur}, sauvegarde chiffree, reprise explicite, conflit et suppression`,
  )
}
