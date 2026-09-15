import assert from 'node:assert/strict'

export async function parcourirCalendrier(page, site, id, moteur, largeur) {
  await page.goto(`${site}/espace/dossiers/${id}`)
  const section = page.getByRole('region', { name: 'Échéance dans ton agenda' })
  const bouton = section.getByRole('button', { name: 'Télécharger l’échéance (.ics)' })
  const telechargements = []
  const memoriser = (fichier) => telechargements.push(fichier)
  page.on('download', memoriser)
  const chemin = `**/espace/dossiers/${id}/echeance`
  try {
    const reception = page.waitForEvent('download')
    await bouton.focus()
    await page.keyboard.press('Enter')
    const fichier = await reception
    assert.equal(fichier.suggestedFilename(), 'echeance-cloison.ics')
    const flux = await fichier.createReadStream()
    assert(flux)
    const blocs = []
    for await (const bloc of flux) blocs.push(bloc)
    const contenu = Buffer.concat(blocs).toString('utf8')
    assert.match(contenu, /^BEGIN:VCALENDAR\r\n/)
    assert(contenu.includes('OCRFICTIF'))
    assert(!/example\.invalid|ATTENDEE|ORGANIZER|ATTACH|VALARM/.test(contenu))
    await section.getByRole('status').filter({ hasText: 'Fichier préparé.' }).waitFor()
    for (const refus of [
      { status: 401 },
      { status: 404 },
      { status: 503 },
      { status: 200, contentType: 'text/html', body: '<p>Réponse fictive</p>' },
      { status: 200, contentType: 'text/calendar', body: 'x'.repeat(4097) },
    ]) {
      await page.route(chemin, (route) => route.fulfill(refus))
      await bouton.click()
      await section
        .getByRole('status')
        .filter({ hasText: 'Le calendrier est indisponible.' })
        .waitFor()
      assert.equal(telechargements.length, 1, 'Aucun fichier pour une reponse refusee')
      await page.unroute(chemin)
    }
    console.log(
      `OK : calendrier ${moteur.name()} ${largeur}, vrai fichier, clavier et refus sans telechargement`,
    )
  } finally {
    page.off('download', memoriser)
    await page.unroute(chemin)
  }
}
