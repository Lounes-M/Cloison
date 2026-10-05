import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function parcourirProduit(page, site, moteur, largeur, repertoire) {
  const section = page.locator('#produit')
  const radios = section.getByRole('radio')
  assert.equal(await radios.count(), 3)
  await radios.nth(0).focus()
  for (const [index, role] of ['locataire', 'garant', 'agence'].entries()) {
    if (index) await page.keyboard.press('ArrowRight')
    assert(await radios.nth(index).isChecked())
    assert.equal(await section.locator('[data-vue-produit]:visible').count(), 1)
    assert(await section.locator(`[data-vue-produit="${role}"]`).isVisible())
    assert.equal(await radios.nth(index).getAttribute('aria-controls'), `apercu-${role}`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    if (repertoire)
      await section.screenshot({ path: join(repertoire, `produit-${role}-${largeur}.png`) })
  }
  await page.keyboard.press('ArrowRight')
  assert(await radios.nth(0).isChecked(), 'Le clavier revient au premier role')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await section.locator('label[for="vue-garant"]').click()
  assert(await section.locator('[data-vue-produit="garant"]').isVisible())
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert.equal(new URL(site).hostname, '127.0.0.1')
  const sansScript = await page
    .context()
    .browser()
    .newContext({ javaScriptEnabled: false, viewport: { width: largeur, height: 900 } })
  try {
    await sansScript.route('**/*', (route) =>
      new URL(route.request().url()).origin === new URL(site).origin
        ? route.continue()
        : route.abort(),
    )
    const autre = await sansScript.newPage()
    await autre.goto(site)
    await autre.locator('label[for="vue-agence"]').click()
    assert(await autre.locator('[data-vue-produit="agence"]').isVisible())
    assert.equal(await autre.locator('[data-vue-produit]:visible').count(), 1)
  } finally {
    await sansScript.close()
  }
  await page.evaluate(() => scrollTo(0, 0))
  console.log(
    `OK : produit ${moteur.name()} ${largeur}, scene unique, clavier, mouvement reduit et sans JavaScript`,
  )
}
