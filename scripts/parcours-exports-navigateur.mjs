import assert from 'node:assert/strict'

export async function parcourirExport(page, registre, id) {
  const section = page.getByRole('region', { name: 'Exporter le registre', exact: true })
  const bouton = section.getByRole('button', { name: 'Télécharger le registre CSV', exact: true })
  const telechargements = []
  const memoriser = (fichier) => telechargements.push(fichier)
  const chemin = `**/espace/exports/${registre}`
  page.on('download', memoriser)
  try {
    const reception = page.waitForEvent('download')
    await bouton.focus()
    await page.keyboard.press('Enter')
    const fichier = await reception
    assert.equal(fichier.suggestedFilename(), `cloison-${registre}.csv`)
    const flux = await fichier.createReadStream()
    assert(flux)
    const blocs = []
    for await (const bloc of flux) blocs.push(bloc)
    const contenu = Buffer.concat(blocs).toString('utf8')
    assert(contenu.startsWith('\ufeff"Référence '))
    assert(contenu.includes(id))
    assert(!/example\.invalid|Mention personnelle|%PDF|cle_scellee/.test(contenu))
    assert.equal(contenu.split('\r\n').length, registre === 'archives' ? 3 : 4)
    if (registre === 'reglements') assert(contenu.includes('"29,00"'))
    await section.getByRole('status').filter({ hasText: 'Fichier préparé.' }).waitFor()
    for (const refus of [
      { status: 403 },
      { status: 503 },
      { status: 413 },
      { status: 200, contentType: 'text/html', body: '<p>Connexion</p>' },
      { status: 200, contentType: 'text/csv', body: 'x'.repeat(2 * 1024 * 1024 + 1) },
    ]) {
      await page.route(chemin, (route) => route.fulfill(refus))
      await bouton.click()
      await section.getByRole('status').filter({ hasText: 'Aucun fichier partiel' }).waitFor()
      assert.equal(telechargements.length, 1, 'Aucun téléchargement pour un export refusé')
      await page.unroute(chemin)
    }
  } finally {
    await page.unroute(chemin)
    page.off('download', memoriser)
  }
}
