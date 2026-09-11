import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
export async function parcourirHistoriqueResponsables(page, site, id, moteur, largeur, simuler) {
  const url = `${site}/espace/dossiers/${id}`
  await page.goto(url)
  const section = page.locator('#historique-responsables'),
    summary = section.locator('summary')
  await summary.focus()
  await page.keyboard.press('Enter')
  assert((await section.locator('li').count()) > 0, 'Affectations absentes de l historique')
  await section.locator('li').first().waitFor()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Debordement de l historique',
  )
  if (process.env.CLOISON_CAPTURE_HISTORIQUE_DIR)
    await section.screenshot({
      path: resolve(
        process.env.CLOISON_CAPTURE_HISTORIQUE_DIR,
        `historique-${moteur.name()}-${largeur}.png`,
      ),
      animations: 'disabled',
    })
  const lignes = Array.from({ length: 55 }, (_, i) => ({
    id: randomUUID(),
    quand: new Date(Date.now() - i * 1000).toISOString(),
    precedent: null,
    precedent_email: null,
    suivant: randomUUID(),
    suivant_email: `collaborateur-${i}@example.invalid`,
    auteur: null,
    auteur_email: null,
  }))
  simuler.donnees(lignes)
  await page.goto(url)
  await summary.focus()
  await page.keyboard.press('Enter')
  assert.equal(await section.locator('li').count(), 50)
  // Diagnostic borne, uniquement sur les fixtures du navigateur local/CI.
  await page.evaluate(() => {
    window.__historiqueClics = []
    for (const type of ['pointerdown', 'pointerup', 'click'])
      document.addEventListener(
        type,
        (e) => {
          if (window.__historiqueClics.length >= 6) return
          const lien = document.querySelector('#historique-responsables a')
          const rect = lien?.getBoundingClientRect()
          queueMicrotask(() =>
            window.__historiqueClics.push({
              type,
              cible: e.target.tagName,
              cibleId: e.target.id,
              cibleClasse: String(e.target.className).slice(0, 100),
              x: e.clientX,
              y: e.clientY,
              scroll: scrollY,
              lienY: rect?.y,
              lienH: rect?.height,
              annule: e.defaultPrevented,
              bouton: e.button,
            }),
          )
        },
        true,
      )
  })
  try {
    await Promise.all([
      page.waitForURL((u) => u.searchParams.has('affectations'), { waitUntil: 'domcontentloaded' }),
      section.getByRole('link', { name: 'Changements précédents', exact: true }).click(),
    ])
  } catch (e) {
    console.log(
      'Diagnostic pagination fictive',
      JSON.stringify(
        await page.evaluate(() => ({
          url: location.href,
          ouvert: document.querySelector('#historique-responsables')?.open,
          liens: [...document.querySelectorAll('#historique-responsables a')].map((a) => ({
            href: a.getAttribute('href'),
            texte: a.textContent,
          })),
          clics: window.__historiqueClics,
          pret: document.readyState,
        })),
      ),
    )
    throw e
  }
  assert.equal(await section.getAttribute('open'), '', 'Le panneau pagine doit etre ouvert')
  await section.getByRole('link', { name: 'Changements les plus récents', exact: true }).waitFor()
  assert.equal(await section.locator('li').count(), 5)
  assert.equal(
    await section.getByText('collaborateur-0@example.invalid', { exact: false }).count(),
    0,
  )
  await section.getByText('collaborateur-54@example.invalid', { exact: false }).waitFor()
  simuler.panne(true)
  await page.goto(url)
  await summary.focus()
  await page.keyboard.press('Enter')
  await section
    .getByText('L’historique est momentanément indisponible.', { exact: false })
    .waitFor()
  assert.equal(await section.locator('li').count(), 0)
  assert.equal((await page.textContent('body')).includes('panne interne fictive'), false)
  await page.getByRole('heading', { name: 'Responsable du dossier', exact: true }).waitFor()
  simuler.panne(false)
  simuler.donnees([])
  console.log(
    `OK : historique ${moteur.name()} ${largeur}, clavier, pages, affectations et panne independante`,
  )
}
