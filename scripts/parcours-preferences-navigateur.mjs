import assert from 'node:assert/strict'
import { resolve } from 'node:path'
export async function parcourirPreferences(page, site, moteur, largeur, conflit) {
  await page.goto(`${site}/espace`)
  await page.getByRole('link', { name: 'Mes notifications', exact: true }).click()
  const couleurs = await page
    .getByRole('button', { name: 'Enregistrer mes préférences' })
    .evaluate((el) => {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-cobalt')
        .trim()
      const n = Number.parseInt(token.slice(1), 16)
      return {
        fond: getComputedStyle(el).backgroundColor,
        attendu: `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`,
      }
    })
  assert.equal(couleurs.fond, couleurs.attendu, 'Bouton principal sans style de marque')
  const mode = page.getByRole('combobox', { name: 'Notifications de suivi' })
  assert.equal(await mode.inputValue(), 'tous')
  await mode.selectOption('mes')
  await page
    .getByRole('checkbox', { name: 'Je confirme mes préférences de notifications.' })
    .check()
  await page.getByRole('button', { name: 'Enregistrer mes préférences' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('status').getByText('Préférences enregistrées.', { exact: true }).waitFor()
  await page.reload()
  assert.equal(await mode.inputValue(), 'mes')
  conflit(true)
  await mode.selectOption('aucun')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Enregistrer mes préférences' }).click()
  await page
    .getByRole('alert')
    .getByText('Préférences non enregistrées. Rechargez la page avant de réessayer.', {
      exact: true,
    })
    .waitFor()
  assert.equal(await page.getByRole('status').count(), 0, 'Faux succes preference')
  conflit(false)
  await page.reload()
  assert.equal(await mode.inputValue(), 'mes')
  await mode.selectOption('aucun')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Enregistrer mes préférences' }).click()
  await page.getByRole('status').waitFor()
  await page.reload()
  assert.equal(await mode.inputValue(), 'aucun')
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Debordement preferences',
  )
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'Preference dans localStorage')
  if (process.env.CLOISON_CAPTURE_PREFERENCES_DIR)
    await page.screenshot({
      path: resolve(
        process.env.CLOISON_CAPTURE_PREFERENCES_DIR,
        `preferences-${moteur.name()}-${largeur}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    })
  console.log(
    `OK : preferences ${moteur.name()} ${largeur}, clavier, persistance, conflit et silence`,
  )
}
