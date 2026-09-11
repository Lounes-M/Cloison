import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export async function parcourirApplicationSecours(page, site, moteur, largeur, fixture) {
  const principal = {
    id: '11111111-1111-4111-8111-111111111111',
    factor_type: 'totp',
    status: 'verified',
    friendly_name: 'Principal',
  }
  fixture.preparer([principal])
  try {
    await page.goto(site + '/espace')
    await page.getByRole('link', { name: 'Application de secours', exact: true }).click()
    await page.waitForURL((u) => u.pathname === '/espace/securite')
    const preparer = page.getByRole('button', {
      name: 'Préparer mon application de secours',
      exact: true,
    })
    await preparer.click()
    await page.locator('code').filter({ hasText: 'CLE_FICTIVE_SECOURS' }).waitFor()
    assert.equal(fixture.facteurs().length, 2)
    const ancienne = fixture.facteurs()[1].id
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Pas de debordement',
    )
    if (process.env.CLOISON_CAPTURE_SECOURS_DIR && moteur.name() === 'chromium') {
      await mkdir(process.env.CLOISON_CAPTURE_SECOURS_DIR, { recursive: true })
      await page.screenshot({
        path: join(process.env.CLOISON_CAPTURE_SECOURS_DIR, `secours-${largeur}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
    await page.reload()
    await page.getByText('Une préparation est en attente.', { exact: false }).waitFor()
    assert.equal(
      await page.locator('code').count(),
      0,
      'La cle ne reapparait pas apres rechargement',
    )
    await page
      .getByRole('button', { name: 'Annuler cette préparation et recommencer', exact: true })
      .click()
    await preparer.waitFor()
    assert.deepEqual(fixture.facteurs(), [principal])
    await preparer.click()
    await page.locator('code').waitFor()
    assert.notEqual(fixture.facteurs()[1].id, ancienne)
    const code = page.locator('#code-secours')
    await code.fill('123456')
    await page.getByRole('button', { name: 'Vérifier le code', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Code non confirmé.' }).waitFor()
    assert.equal(fixture.facteurs()[1].status, 'unverified')
    fixture.accepter()
    await code.fill('123456')
    await page.getByRole('button', { name: 'Vérifier le code', exact: true }).click()
    await page
      .getByRole('status')
      .filter({ hasText: /applications sont vérifiées|application de secours est vérifiée/ })
      .waitFor()
    assert.equal(await page.locator('code').count(), 0)
    await page.reload()
    await page
      .getByRole('status')
      .filter({ hasText: 'Au moins deux applications sont vérifiées.' })
      .waitFor()
    assert.equal(await preparer.count(), 0)
    const applications = page.getByRole('region', { name: 'Vos applications vérifiées' })
    assert.equal(await applications.getByRole('listitem').count(), 2)
    const test = applications.getByRole('listitem').last()
    await test.getByLabel('Code à six chiffres', { exact: true }).fill('123456')
    await test.getByRole('button', { name: 'Tester cette application', exact: true }).click()
    await test
      .getByRole('status')
      .filter({ hasText: 'Le code de cette application a été confirmé.' })
      .waitFor()
    assert.equal(fixture.facteurs().length, 2, 'Le test ne supprime aucun facteur')
    assert.equal(fixture.facteurs().filter((f) => f.status === 'verified').length, 2)
    const secondaire = { ...fixture.facteurs()[1], friendly_name: 'Secondaire historique' }
    fixture.preparer([
      principal,
      secondaire,
      {
        id: '33333333-3333-4333-8333-333333333333',
        factor_type: 'totp',
        status: 'unverified',
        friendly_name: 'Cloison secours',
      },
    ])
    await page.reload()
    await page
      .getByRole('button', { name: 'Annuler cette préparation et recommencer', exact: true })
      .click()
    await page
      .getByRole('status')
      .filter({ hasText: 'Au moins deux applications sont vérifiées.' })
      .waitFor()
    assert.deepEqual(
      fixture.facteurs(),
      [principal, secondaire],
      'La preparation heritee est retiree, les deux applications sont conservees',
    )
    console.log(
      `OK : application secours ${moteur.name()} ${largeur}, preparation, rechargement, annulation, erreur et confirmation`,
    )
  } finally {
    fixture.preparer([])
  }
}
