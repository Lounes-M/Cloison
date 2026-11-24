import assert from 'node:assert/strict'
import { connecterAgence, courrielApplicatif } from './acteurs.mjs'
import { pdfFictif, photoFictive } from './pieces-fictives.mjs'

/** Une mention manuscrite valable pour ce plafond, solidaire. */
export function mentionPour(locataire, enLettres, enChiffres) {
  return (
    `Je me porte caution de ${locataire} et je paierai au bailleur ce que doit le locataire en cas ` +
    `de defaillance de sa part, dans la limite de ${enLettres} euros (${enChiffres} euros), en ` +
    'principal et accessoires. Je m engage solidairement et renonce aux benefices de discussion et ' +
    'de division.'
  )
}

/**
 * Une agence neuve, jusqu'a pouvoir ouvrir de vrais dossiers : connexion par
 * lien, second facteur, nom de l'espace, demande d'activation, puis la requete
 * que l'exploitant recoit par courriel.
 */
export async function installerAgence(monde, suffixe = '') {
  const { db, faux } = monde.env
  const domaine = `agence-${monde.passage}${suffixe}.fr`
  const admin = `direction@${domaine}`
  const agence = await monde.acteur(`agence${suffixe}`)
  await connecterAgence(agence, admin, monde.secrets)
  const page = agence.page
  await page.fill('input[name=nom]', `Agence du Parcours ${monde.passage}${suffixe}`)
  await page.keyboard.press('Enter')
  await page.locator('input[name=siren]').waitFor()
  await agence.controler('agence-espace-decouverte')
  monde.noter('agence connectee par lien et second facteur, espace nomme')

  await page.fill('input[name=siren]', '732829320')
  await page.fill('input[name=cartePro]', 'CPI 7501 2024 000 000 123')
  await page.locator('form:has(input[name=siren]) button[type=submit]').click()
  const activation = await courrielApplicatif(faux, 'exploitation@cloison.invalid', (c) =>
    c.text.includes(domaine),
  )
  assert.match(activation.text, /\[ok\] En activite/, 'Le controle du SIREN figure au courriel')
  // L'exploitant applique exactement la requete que son courriel lui donne.
  const requete = /update public\.agences set statut = 'verifiee'[^;]+;/.exec(activation.text)
  assert(requete, 'Le courriel d’activation donne la requete a executer')
  assert.equal((await db.query(requete[0])).rowCount, 1)
  monde.noter('activation demandee, controlee a l’annuaire, appliquee depuis le courriel')
  await page.reload()
  return { agence, admin, domaine }
}

/**
 * Tout ce que fait un garant, par les vrais formulaires : engagement, pieces
 * de son profil, mention.
 */
export async function completerGarant(page, { profil, revenu, plafond, mention, identite }) {
  const engagement = page.locator('form:has(select[name=profil])')
  await engagement.locator('select[name=profil]').selectOption(profil)
  await engagement.locator('input[name=revenu]').fill(revenu)
  await engagement.locator('input[name=couvre][value=loyer_charges]').check()
  await engagement.locator('input[name=montant]').fill(plafond)
  await engagement.locator('input[name=solidaire]').check()
  await engagement.locator('button[type=submit]').click()
  await page.locator('section#mention').waitFor()

  if (profil === 'retraite') {
    await deposer(page, 'pension_retraite', [await pdfFictif('pension-de-retraite', 1)])
  } else {
    // Les bulletins : un seul PDF de trois pages, declare pour trois documents.
    await deposer(page, 'bulletin_paie', [await pdfFictif('bulletins-de-paie', 3)], '3')
  }
  await deposer(page, 'avis_imposition', [await pdfFictif('avis-imposition', 2)])
  // La piece d'identite : deux photos de telephone, reunies en un seul PDF
  // dans le navigateur avant l'envoi.
  await deposer(page, 'piece_identite', [
    photoFictive('identite-recto'),
    photoFictive('identite-verso'),
  ])
  await deposer(page, 'justificatif_domicile', [photoFictive('facture', 1600, 2000)])

  const formulaire = page.locator('form:has(textarea[name=mention])')
  await formulaire.locator('input[name=prenom]').fill(identite.prenom)
  await formulaire.locator('input[name=nom]').fill(identite.nom)
  await formulaire.locator('input[name=adresse]').fill(identite.adresse)
  await formulaire.locator('textarea[name=mention]').fill(mention)
  await formulaire.locator('button[type=submit]').click()
  await page.locator('#mention .message-succes').waitFor()
}

/** Depose un ou plusieurs fichiers pour une nature, par le vrai formulaire. */
export async function deposer(page, nature, fichiers, nombre) {
  const bloc = page.locator(`#piece-${nature}`)
  const formulaire = bloc.locator('form:has(input[name=fichier])')
  const avant = await bloc.locator('a[href^="/garant/pieces/"]').count()
  await formulaire.locator('input[name=fichier]').setInputFiles(fichiers)
  // La preparation (reduction d'une photo, reunion de plusieurs) est finie
  // quand le rappel « pas encore envoye » apparait.
  await formulaire.locator('.message-info').waitFor()
  // La taille annoncee suit la langue : « Ko » et « Mo » en francais, « KB » et
  // « MB » en anglais.
  const selection = await formulaire.locator('p[role=status]').first().innerText()
  const anglais = (await page.locator('[data-espace]').getAttribute('lang')) === 'en'
  assert.match(
    selection,
    anglais ? /\(\d[\d.]* (B|KB|MB)\)/ : /\(\d[\d,]* (o|Ko|Mo)\)/,
    `Taille annoncee : ${selection}`,
  )
  if (nombre) await formulaire.locator('select[name=nombre_documents]').selectOption(nombre)
  await formulaire.locator('button[type=submit]').click()
  await bloc
    .locator('a[href^="/garant/pieces/"]')
    .nth(avant)
    .waitFor({ timeout: 45_000 })
    .catch(async (erreur) => {
      throw new Error(`Depot ${nature} non abouti : ${await bloc.innerText()}`, { cause: erreur })
    })
}
