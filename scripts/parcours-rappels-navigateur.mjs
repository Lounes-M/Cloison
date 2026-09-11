import assert from 'node:assert/strict'
import { resolve } from 'node:path'
export async function parcourirRappels(page, site, moteur, largeur, simulation) {
  await page.goto(`${site}/espace`)
  await page.getByRole('link', { name: 'Relances et échéances', exact: true }).click()
  const relance = page.getByRole('combobox', {
    name: 'Relancer le garant après une période sans modification',
  })
  const echeance = page.getByRole('combobox', {
    name: 'Prévenir les collaborateurs avant l’échéance du dossier',
  })
  const bouton = page.getByRole('button', { name: 'Enregistrer les rappels' })
  assert.equal(await relance.inputValue(), '0')
  assert.equal(await echeance.inputValue(), '0')
  const couleurs = await bouton.evaluate((el) => {
    const n = Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--color-cobalt').trim().slice(1),
      16,
    )
    return {
      fond: getComputedStyle(el).backgroundColor,
      attendu: `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`,
    }
  })
  assert.equal(couleurs.fond, couleurs.attendu, 'Bouton rappels sans couleur de marque')
  await relance.selectOption('7')
  await echeance.selectOption('3')
  await page.getByRole('checkbox').check()
  await bouton.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('status').getByText('Réglages enregistrés.', { exact: true }).waitFor()
  await page.reload()
  assert.equal(await relance.inputValue(), '7')
  assert.equal(await echeance.inputValue(), '3')
  simulation.conflit(true)
  await relance.selectOption('14')
  await page.getByRole('checkbox').check()
  await bouton.click()
  await page
    .getByRole('alert')
    .getByText('Réglages non enregistrés. Rechargez la page avant de réessayer.', { exact: true })
    .waitFor()
  assert.equal(await page.getByRole('status').count(), 0, 'Faux succes rappels')
  simulation.conflit(false)
  await page.reload()
  assert.equal(await relance.inputValue(), '7')
  await relance.selectOption('0')
  await echeance.selectOption('0')
  await page.getByRole('checkbox').check()
  await bouton.click()
  await page.getByRole('status').getByText('Réglages enregistrés.', { exact: true }).waitFor()
  await page.reload()
  assert.equal(await relance.inputValue(), '0')
  assert.equal(await echeance.inputValue(), '0')
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Debordement rappels',
  )
  assert.equal(
    await page.evaluate(() => localStorage.length),
    0,
    'Reglages rappels dans localStorage',
  )
  if (process.env.CLOISON_CAPTURE_RAPPELS_DIR)
    await page.screenshot({
      path: resolve(
        process.env.CLOISON_CAPTURE_RAPPELS_DIR,
        `rappels-${moteur.name()}-${largeur}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    })
  simulation.role('membre')
  await page.goto(`${site}/espace`)
  assert.equal(
    await page.getByRole('link', { name: 'Relances et échéances', exact: true }).count(),
    0,
    'Reglages admin montres au membre',
  )
  await page.goto(`${site}/espace/rappels`)
  assert.equal(
    await page.getByRole('button', { name: 'Enregistrer les rappels' }).count(),
    0,
    'Formulaire admin accessible au membre',
  )
  simulation.role('admin')
  console.log(
    `OK : rappels ${moteur.name()} ${largeur}, clavier, persistance, conflit, desactivation et refus membre`,
  )
}
