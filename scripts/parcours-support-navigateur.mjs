import assert from 'node:assert/strict'
import { resolve } from 'node:path'
export async function parcourirSupport(page, moteur, largeur, espace) {
  const cadre = page.locator('details').filter({
    has: page.locator('summary').getByText('Besoin d’aide sur ce dossier ?', { exact: true }),
  })
  await cadre.locator('summary').focus()
  await page.keyboard.press('Enter')
  const choix = cadre.getByRole('combobox', { name: 'Catégorie du problème' })
  await choix.waitFor()
  if (espace === 'garant')
    assert.equal(
      await choix.locator('option[value="paiement"]').count(),
      0,
      'Paiement propose au garant',
    )
  const categorie = espace === 'locataire' ? 'paiement' : espace === 'garant' ? 'depot' : 'examen'
  await choix.selectOption(categorie)
  const texte = cadre.getByRole('textbox', { name: 'Message à compléter dans la messagerie' })
  const valeur = await texte.inputValue()
  assert(valeur.includes('OCRFICTIF'))
  assert(
    !/garant@example|locataire@example|100000|cloison_capacite|access_token/.test(valeur),
    'Donnees du dossier ajoutees au message',
  )
  const lien = cadre.getByRole('link', { name: 'Ouvrir ma messagerie' })
  const url = new URL(await lien.getAttribute('href'))
  assert.equal(url.protocol, 'mailto:')
  assert.equal(decodeURIComponent(url.pathname), 'support@example.invalid')
  assert.deepEqual([...url.searchParams.keys()], ['subject', 'body'])
  assert.equal(url.searchParams.get('body'), valeur)
  await lien.evaluate((el) =>
    el.addEventListener(
      'click',
      (e) => {
        e.preventDefault()
        el.dataset.essaye = 'oui'
      },
      { once: true },
    ),
  )
  await lien.click()
  assert.equal(await lien.getAttribute('data-essaye'), 'oui')
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('refus-fictif')
        },
      },
    }),
  )
  await cadre.getByRole('button', { name: 'Copier le message' }).click()
  await cadre
    .getByRole('alert')
    .getByText('Copie indisponible. Le message peut être sélectionné dans le champ ci-dessus.', {
      exact: true,
    })
    .waitFor()
  assert.equal(await cadre.getByRole('status').count(), 0, 'Faux succes de copie')
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (v) => {
          window.__supportCopie = v
        },
      },
    }),
  )
  await cadre.getByRole('button', { name: 'Copier le message' }).click()
  await cadre.getByRole('status').waitFor()
  assert.equal(await page.evaluate(() => window.__supportCopie), valeur)
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'Support dans localStorage')
  assert.deepEqual(
    await page.evaluate(() => window.__cloisonEvalInterdit),
    [],
    'Compilation dynamique tentee sous CSP',
  )
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Debordement support',
  )
  if (process.env.CLOISON_CAPTURE_SUPPORT_DIR) {
    await cadre.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: resolve(
        process.env.CLOISON_CAPTURE_SUPPORT_DIR,
        `support-${espace}-${moteur.name()}-${largeur}.png`,
      ),
      animations: 'disabled',
    })
  }
  console.log(
    `OK : support ${espace} ${moteur.name()} ${largeur}, message minimal, categorie, clavier et panne de copie`,
  )
}
