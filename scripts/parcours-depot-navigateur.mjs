import assert from 'node:assert/strict'

export async function parcourirDepot(page, site, moteur, largeur) {
  await page.goto(site + '/garant')
  const champ = page.locator('input[type="file"]').first()
  const formulaire = champ.locator('xpath=..')
  const envoyer = formulaire.getByRole('button', { name: 'Déposer le fichier sélectionné' })
  let envois = 0
  const compter = (requete) => {
    if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/garant') envois++
  }
  page.on('request', compter)
  try {
    await envoyer.click()
    assert.equal(await champ.evaluate((input) => input.validity.valueMissing), true)
    await champ.setInputFiles({
      name: 'vide.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(0),
    })
    await formulaire.getByRole('alert').filter({ hasText: 'non vide' }).waitFor()
    await envoyer.click()
    await champ.setInputFiles({
      name: 'trop-grand.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
    })
    await formulaire.getByRole('alert').filter({ hasText: 'dépasse 4 Mo' }).waitFor()
    assert.equal(await champ.getAttribute('aria-invalid'), 'true')
    await envoyer.click()
    await page.waitForTimeout(150)
    assert.equal(envois, 0, 'Aucun envoi des fichiers invalides')
    await champ.setInputFiles({
      name: 'selection.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-fictif'),
    })
    await formulaire.getByRole('status').filter({ hasText: 'selection.pdf' }).waitFor()
    assert.equal(await champ.evaluate((input) => input.checkValidity()), true)
    assert.equal(await formulaire.getByRole('alert').count(), 0)
    await formulaire.getByRole('button', { name: 'Annuler la sélection' }).click()
    assert.equal(await champ.inputValue(), '')
    assert.equal(await champ.evaluate((input) => input.validity.valueMissing), true)
    await champ.setInputFiles({
      name: 'autre.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-fictif'),
    })
    await formulaire.getByRole('status').filter({ hasText: 'autre.pdf' }).waitFor()
    await formulaire.evaluate((form) => form.reset())
    await formulaire
      .getByRole('button', { name: 'Annuler la sélection' })
      .waitFor({ state: 'hidden' })
    assert.equal(await champ.inputValue(), '')
    assert.equal(envois, 0)
    console.log(`OK : depot ${moteur.name()} ${largeur}, taille, vide, remplacement et annulation`)
  } finally {
    page.off('request', compter)
  }
}
