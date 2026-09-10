import assert from 'node:assert/strict'
export async function parcourirConnecteur(page, site, moteur, largeur) {
  await page.goto(`${site}/espace/connecteurs`)
  await page.getByRole('heading', { name: 'Connexions aux logiciels' }).waitFor()
  const creation = page
    .locator('form')
    .filter({ has: page.getByRole('textbox', { name: 'Nom du logiciel ou de la connexion' }) })
  await creation.getByRole('textbox').fill('Connecteur navigateur')
  await creation.getByRole('checkbox').check()
  await creation.getByRole('button', { name: 'Créer un accès' }).focus()
  await page.keyboard.press('Enter')
  const cle = page.getByRole('textbox', { name: 'Clé privée, affichée une seule fois' })
  await cle.waitFor()
  assert.match(await cle.inputValue(), /^cloison_read_[A-Za-z0-9_-]{43}$/)
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'Cle conservee en localStorage')
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Debordement connecteur mobile',
  )
  await page.getByRole('button', { name: 'Masquer la clé' }).click()
  assert.equal(await cle.count(), 0, 'Cle encore affichee')
  const ligne = page
    .locator('li')
    .filter({ has: page.getByRole('heading', { name: 'Connecteur navigateur' }) })
  await ligne.getByRole('checkbox').check()
  await ligne.getByRole('button', { name: 'Révoquer cet accès' }).click()
  await ligne.getByText('Révoqué', { exact: true }).waitFor()
  assert.equal(await ligne.getByRole('button', { name: 'Révoquer cet accès' }).count(), 0)
  console.log(
    `OK : connecteur ${moteur.name()} ${largeur}, creation, cle temporaire, clavier et revocation`,
  )
}
