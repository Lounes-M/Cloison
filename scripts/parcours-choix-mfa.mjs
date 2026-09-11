import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export async function parcourirChoixMfa(page, site, moteur, largeur, fixture) {
  const a = '11111111-1111-4111-8111-111111111111',
    b = '22222222-2222-4222-8222-222222222222'
  fixture.preparer([
    { id: a, factor_type: 'totp', status: 'verified', friendly_name: 'Principal' },
    { id: b, factor_type: 'totp', status: 'verified', friendly_name: '<script>Secours</script>' },
    {
      id: '33333333-3333-4333-8333-333333333333',
      factor_type: 'totp',
      status: 'unverified',
      friendly_name: 'En attente',
    },
  ])
  try {
    await page.goto(site + '/connexion/securite')
    const choix = page.getByLabel('Application d’authentification', { exact: true })
    await choix.waitFor()
    assert.equal(await choix.locator('option').count(), 2)
    assert.equal(await choix.inputValue(), a)
    await choix.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    assert.equal(await choix.inputValue(), b, 'Le second facteur est accessible au clavier')
    assert.equal(
      await page
        .locator('script')
        .filter({ hasText: /^Secours$/ })
        .count(),
      0,
    )
    const code = page.getByLabel('Code à six chiffres', { exact: true })
    await code.fill('123456')
    await page.getByRole('button', { name: 'Vérifier le code', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Vérification impossible.' }).waitFor()
    assert.equal(await choix.inputValue(), b, 'Une erreur conserve le facteur choisi')
    assert.deepEqual(fixture.demandes(), [b], 'La verification utilise le facteur choisi')
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Pas de debordement MFA',
    )
    if (process.env.CLOISON_CAPTURE_MFA_DIR && moteur.name() === 'chromium') {
      await mkdir(process.env.CLOISON_CAPTURE_MFA_DIR, { recursive: true })
      await page.screenshot({
        path: join(process.env.CLOISON_CAPTURE_MFA_DIR, `mfa-${largeur}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
    fixture.accepter()
    await code.fill('123456')
    await page.getByRole('button', { name: 'Vérifier le code', exact: true }).click()
    await page.waitForURL((u) => u.pathname === '/espace')
    assert.deepEqual(fixture.demandes(), [b, b])
    console.log(
      `OK : choix MFA ${moteur.name()} ${largeur}, clavier, facteur secondaire, erreur et connexion`,
    )
  } finally {
    fixture.preparer([])
  }
}
