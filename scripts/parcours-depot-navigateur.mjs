import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import { PDFDocument } from 'pdf-lib'

/** Une photo d'essai : une page de couleur unie, au format d'un telephone. */
function photo(nom, couleur, type = 'image/jpeg') {
  const toile = createCanvas(1200, 1600)
  const ctx = toile.getContext('2d')
  ctx.fillStyle = couleur
  ctx.fillRect(0, 0, 1200, 1600)
  return { name: nom, mimeType: type, buffer: toile.toBuffer(type) }
}

/** Ce que le champ enverrait : son seul fichier, lu dans la page. */
async function fichierDuChamp(champ) {
  return champ.evaluate(async (input) => ({
    nombre: input.files.length,
    type: input.files[0]?.type,
    octets: Array.from(new Uint8Array(await input.files[0].arrayBuffer())),
  }))
}

export async function parcourirDepot(page, site, moteur, largeur) {
  await page.goto(site + '/garant')
  const champ = page.locator('input[type="file"]').first()
  const formulaire = champ.locator('xpath=..')
  const envoyer = formulaire.getByRole('button', { name: 'Déposer le fichier sélectionné' })
  let envois = 0
  const compter = (requete) => {
    if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/garant') envois++
  }
  page.on('request', compter)
  try {
    // L'envoi n'apparait qu'une fois un fichier choisi, apres l'hydratation.
    await envoyer.waitFor({ state: 'detached' })
    assert.equal(await champ.evaluate((input) => input.validity.valueMissing), true)
    await champ.setInputFiles({
      name: 'vide.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(0),
    })
    await formulaire.getByRole('alert').filter({ hasText: 'non vide' }).waitFor()
    await envoyer.click()
    await champ.setInputFiles({
      name: 'trop-grand.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
    })
    await formulaire.getByRole('alert').filter({ hasText: 'dépasse 4 Mo' }).waitFor()
    assert.equal(await champ.getAttribute('aria-invalid'), 'true')
    await envoyer.click()
    await page.waitForTimeout(150)
    assert.equal(envois, 0, 'Aucun envoi des fichiers invalides')
    await champ.setInputFiles({
      name: 'selection.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-fictif'),
    })
    await formulaire.getByRole('status').filter({ hasText: 'selection.pdf' }).waitFor()
    assert.equal(await champ.evaluate((input) => input.checkValidity()), true)
    assert.equal(await formulaire.getByRole('alert').count(), 0)
    await formulaire.getByRole('button', { name: 'Annuler la sélection' }).click()
    assert.equal(await champ.inputValue(), '')
    assert.equal(await champ.evaluate((input) => input.validity.valueMissing), true)
    assert.equal(await envoyer.count(), 0)
    await champ.setInputFiles({
      name: 'autre.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-fictif'),
    })
    await formulaire.getByRole('status').filter({ hasText: 'autre.pdf' }).waitFor()
    await formulaire.evaluate((form) => form.reset())
    await formulaire
      .getByRole('button', { name: 'Annuler la sélection' })
      .waitFor({ state: 'hidden' })
    assert.equal(await champ.inputValue(), '')

    // Plusieurs photos choisies d'un coup partent en un seul PDF, dans l'ordre.
    const reunies = (nombre) =>
      formulaire
        .getByRole('status')
        .filter({ hasText: `${nombre} pages réunies en un seul PDF` })
        .waitFor()
    await champ.setInputFiles([
      photo('page-1.jpg', '#c00000'),
      photo('page-2.jpg', '#00a000'),
      photo('page-3.jpg', '#0000c0'),
    ])
    await reunies(3)
    let envoi = await fichierDuChamp(champ)
    assert.equal(envoi.nombre, 1, 'Un seul fichier part, pas trois photos')
    assert.equal(envoi.type, 'application/pdf')
    assert.equal((await PDFDocument.load(Buffer.from(envoi.octets))).getPageCount(), 3)
    assert.equal(await champ.evaluate((input) => input.checkValidity()), true)
    await envoyer.waitFor()

    // Sur un telephone, l'appareil photo rend une page a la fois : on en ajoute.
    const ajout = formulaire.locator('input[type="file"]').nth(1)
    await ajout.setInputFiles(photo('page-4.png', '#c0c000', 'image/png'))
    await reunies(4)
    envoi = await fichierDuChamp(champ)
    assert.equal((await PDFDocument.load(Buffer.from(envoi.octets))).getPageCount(), 4)
    await formulaire.getByRole('button', { name: 'Retirer la dernière page' }).click()
    await reunies(3)

    // Un PDF glisse dans un ajout est refuse sans perdre les pages deja reunies.
    await ajout.setInputFiles({
      name: 'autre.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-fictif'),
    })
    await formulaire.getByRole('alert').filter({ hasText: 'uniquement des photos' }).waitFor()
    envoi = await fichierDuChamp(champ)
    assert.equal((await PDFDocument.load(Buffer.from(envoi.octets))).getPageCount(), 3)
    await formulaire.getByRole('button', { name: 'Annuler la sélection' }).click()
    assert.equal(await champ.inputValue(), '')

    // Un choix qui melange photo et PDF ne laisse rien partir.
    await champ.setInputFiles([
      photo('page-1.jpg', '#c00000'),
      { name: 'autre.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-fictif') },
    ])
    await formulaire.getByRole('alert').filter({ hasText: 'uniquement des photos' }).waitFor()
    assert.equal(await champ.inputValue(), '')
    assert.equal(await envoyer.count(), 0)

    // Une photo seule reste une photo, et devient un PDF des la deuxieme page.
    await champ.setInputFiles(photo('recto.jpg', '#c00000'))
    await formulaire.getByRole('status').filter({ hasText: 'recto.jpg' }).waitFor()
    assert.equal((await fichierDuChamp(champ)).type, 'image/jpeg')
    await ajout.setInputFiles(photo('verso.jpg', '#00a000'))
    await reunies(2)
    await formulaire.getByRole('button', { name: 'Retirer la dernière page' }).click()
    await formulaire.getByRole('status').filter({ hasText: 'recto.jpg' }).waitFor()
    assert.equal((await fichierDuChamp(champ)).type, 'image/jpeg')
    await formulaire.getByRole('button', { name: 'Annuler la sélection' }).click()
    assert.equal(await formulaire.locator('input[type="file"]').count(), 1)

    assert.equal(envois, 0)
    console.log(
      `OK : depot ${moteur.name()} ${largeur}, taille, vide, remplacement, annulation et pages reunies`,
    )
  } finally {
    page.off('request', compter)
  }
}
