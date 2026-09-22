import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function parcourirOcrSelectif(page, contexte, id, moteur, largeur) {
  const url = `**/espace/pieces/${id}`
  let appels = 0,
    mode = 'normal'
  const attentes = []
  const handler = async (route) => {
    appels++
    const selection = route.request().headers()['x-cloison-ocr-pages']
    assert.equal(selection, '2,3')
    const version = appels
    if (mode === 'attente') await new Promise((r) => attentes.push(r))
    const pages =
      mode === 'invalide'
        ? [{ page: 1, texte: 'Resultat incorrect' }]
        : [
            { page: 2, texte: `Salaire fictif lecture ${version}` },
            { page: 3, texte: 'Cotisations fictives <script>window.ocrInjecte=true</script>' },
          ]
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pages,
          modele: 'fictif/modele',
          empreinte: 'b'.repeat(64),
          observeLe: new Date().toISOString(),
        }),
      })
      .catch(() => {}) // Une requete interrompue peut ne plus avoir de destinataire.
  }
  await contexte.route(url, handler)
  try {
    const saisie = page.getByRole('textbox', { name: 'Pages à lire', exact: true })
    const lancer = () => page.getByRole('button', { name: 'Extraire le texte', exact: true })
    const consentir = () =>
      page.getByRole('checkbox', { name: 'Envoyer uniquement les pages', exact: false }).check()
    await saisie.fill('41')
    await page.getByText('Indiquez des pages entre', { exact: false }).waitFor()
    assert(await lancer().isDisabled())
    assert.equal(appels, 0)
    await saisie.fill('2')
    await consentir()
    await saisie.fill('2-3')
    assert(await lancer().isDisabled(), 'Une selection modifiee doit renouveler le consentement')
    await consentir()
    await lancer().focus()
    await page.keyboard.press('Enter')
    await page.getByText('Salaire fictif lecture 1', { exact: true }).waitFor()
    const suivant = page.getByRole('button', { name: 'Page suivante', exact: true })
    await suivant.click()
    await page.getByText('Cotisations fictives', { exact: false }).waitFor()
    assert.equal(await page.evaluate(() => window.ocrInjecte), undefined)
    const rechercher = page.getByRole('searchbox', { name: 'Rechercher dans la transcription' })
    await rechercher.fill('SALAIRE')
    await page.getByText('Salaire fictif lecture 1', { exact: true }).waitFor()
    assert(await suivant.isDisabled())
    await rechercher.fill('introuvable')
    await page.getByText('Aucune page ne contient ce texte.').waitFor()
    await rechercher.fill('')
    await page.getByRole('combobox', { name: 'Page de la transcription' }).selectOption('3')
    await page.getByText('Cotisations fictives', { exact: false }).waitFor()
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Debordement OCR selectif',
    )
    if (process.env.OCR_CAPTURE_DIR) {
      assert(
        await page
          .locator('a[href="#contenu-espace"]')
          .evaluate((e) => e === document.activeElement || e.getBoundingClientRect().bottom <= 0),
        'Le lien d evitement masque la lecture sans avoir le focus',
      )
      await mkdir(process.env.OCR_CAPTURE_DIR, { recursive: true })
      await page.screenshot({
        path: resolve(process.env.OCR_CAPTURE_DIR, `ocr-${moteur.name()}-${largeur}.png`),
        fullPage: true,
      })
      await page
        .getByText('Aide à la lecture', { exact: true })
        .locator('..')
        .screenshot({
          path: resolve(process.env.OCR_CAPTURE_DIR, `panneau-${moteur.name()}-${largeur}.png`),
        })
    }
    await page.getByRole('button', { name: 'Effacer la transcription' }).click()
    assert(await lancer().isDisabled())
    mode = 'attente'
    // Simuler un transport qui termine malgre l'annulation de son appelant.
    await page.evaluate(() => {
      window.__ocrFetchOriginal = window.fetch
      window.__ocrReponsesAchevees = 0
      window.fetch = (url, options) =>
        window.__ocrFetchOriginal(url, { ...options, signal: undefined }).then((r) => {
          window.__ocrReponsesAchevees++
          return r
        })
    })
    await consentir()
    await lancer().click()
    await page.getByRole('button', { name: 'Interrompre la lecture' }).waitFor()
    // Attendre l'arrivee effective de chaque requete, sans temporisation arbitraire.
    await attendre(() => attentes.length === 1)
    await page.getByRole('button', { name: 'Interrompre la lecture' }).click()
    await page.getByText('Lecture interrompue et résultat effacé.', { exact: false }).waitFor()
    await consentir()
    await lancer().click()
    await attendre(() => attentes.length === 2)
    attentes[0]()
    await page.waitForFunction(() => window.__ocrReponsesAchevees === 1)
    assert(await page.getByRole('button', { name: 'Lecture en cours…' }).isDisabled())
    attentes[1]()
    await page.getByText('Salaire fictif lecture 3', { exact: true }).waitFor()
    assert.equal(await page.getByText('Salaire fictif lecture 2', { exact: true }).count(), 0)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      delete document.hidden
    })
    await page.getByText('Salaire fictif lecture 3', { exact: true }).waitFor({ state: 'detached' })
    assert(await lancer().isDisabled())
    mode = 'invalide'
    await consentir()
    await lancer().click()
    await page.getByText('Lecture indisponible :', { exact: false }).waitFor()
    assert.equal(await page.getByText('Resultat incorrect', { exact: true }).count(), 0)
    assert.equal(await page.evaluate(() => localStorage.length), 0)
    assert.deepEqual(await page.evaluate(() => window.__cloisonEvalInterdit), [])
    console.log(
      `OK : OCR selectif ${moteur.name()} ${largeur}, selection, pagination, recherche, consentement, interruption, reponse tardive et masquage`,
    )
  } finally {
    await page
      .evaluate(() => {
        if (window.__ocrFetchOriginal) window.fetch = window.__ocrFetchOriginal
        delete window.__ocrFetchOriginal
      })
      .catch(() => {})
    for (const resoudre of attentes) resoudre()
    await contexte.unroute(url, handler)
  }
}
async function attendre(predicate) {
  const avant = Date.now() + 5000
  while (!predicate() && Date.now() < avant) await new Promise((r) => setTimeout(r, 20))
  assert(predicate(), 'Requete OCR de test absente')
}
