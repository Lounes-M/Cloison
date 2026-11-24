import assert from 'node:assert/strict'
import { courrielApplicatif, lienPorteur } from './acteurs.mjs'
import { completerGarant, deposer, installerAgence, mentionPour } from './etapes.mjs'
import { pdfFictif } from './pieces-fictives.mjs'
import { jusqua, passerLaMaintenance } from './outils.mjs'

/**
 * Ce qui arrive quand tout ne va pas droit : un garant insuffisant complete
 * par un second, une piece a remplacer, puis un refus.
 */
export async function parcoursIncidents(monde) {
  const { env, passage, langue } = monde
  const { db, faux } = env
  const locataire = `luc.locataire.${passage}@exemple.fr`
  const premierGarant = `greta.garante.${passage}@exemple.fr`
  const secondGarant = `gil.garant.${passage}@exemple.fr`
  const statut = async (id) =>
    (await db.query('select statut from dossiers where id = $1', [id])).rows[0].statut

  const { agence } = await installerAgence(monde, 'i')
  let page = agence.page
  const ouverture = page.locator('#nouveau-dossier form:has(input[name=loyer])')
  await ouverture.locator('input[name=courriel]').fill(locataire)
  await ouverture.locator('input[name=loyer]').fill('1000')
  await ouverture.locator('select[name=langueLocataire]').selectOption(langue)
  await ouverture.locator('button[type=submit]').click()
  const invitation = await courrielApplicatif(faux, locataire)
  const {
    rows: [dossier],
  } = await db.query('select id, reference from dossiers where email_locataire = $1', [locataire])

  // ------------------------------------------------ un garant qui ne suffit pas
  const leLocataire = await monde.acteur('locataire')
  page = await leLocataire.aller(lienPorteur(invitation))
  await page.waitForURL('**/locataire')
  const designation = page.locator('#garant form:has(select[name=langueGarant])')
  await designation.locator('input[name=courriel]').fill(premierGarant)
  await designation.locator('select[name=langueGarant]').selectOption(langue)
  await designation.locator('button[type=submit]').click()
  const greta = await monde.acteur('garant-insuffisant')
  page = await greta.aller(lienPorteur(await courrielApplicatif(faux, premierGarant)))
  await page.waitForURL('**/garant')
  const mentionGreta = mentionPour('Luc Locataire', 'trente-six mille', '36000')
  await completerGarant(page, {
    profil: 'salarie',
    revenu: '2000',
    plafond: '36000',
    mention: mentionGreta,
    identite: { prenom: 'Greta', nom: 'Garante', adresse: '4 rue du Test, 44000 Nantes' },
  })
  assert.equal(
    await statut(dossier.id),
    'garant_insuffisant',
    '2 000 pour 1 000 : deux fois le loyer',
  )
  await page.reload()
  await greta.controler('garant-insuffisant', { francaisAdmis: [mentionGreta] })
  monde.noter('garant a deux fois le loyer : dossier juge insuffisant')

  // -------------------------------------------------------- le second garant
  page = await leLocataire.aller('/locataire')
  await page.locator('#second-garant').waitFor()
  await leLocataire.controler('locataire-garant-insuffisant')
  const second = page.locator('#second-garant form:has(input[name=courriel])')
  await second.locator('input[name=courriel]').fill(secondGarant)
  await second.locator('select[name=langueGarant]').selectOption(langue)
  await second.locator('button[type=submit]').click()
  const gil = await monde.acteur('second-garant')
  page = await gil.aller(lienPorteur(await courrielApplicatif(faux, secondGarant)))
  await page.waitForURL('**/garant')
  assert(!(await gil.texte()).includes(premierGarant), 'Le second garant ne voit pas le premier')
  const mentionGil = mentionPour('Luc Locataire', 'trente-six mille', '36000')
  await completerGarant(page, {
    profil: 'retraite',
    revenu: '1500',
    plafond: '36000',
    mention: mentionGil,
    identite: { prenom: 'Gil', nom: 'Garant', adresse: '6 rue du Test, 13001 Marseille' },
  })
  await jusqua(
    async () => (await statut(dossier.id)) === 'complet',
    'dossier complet a deux garants',
  )
  await gil.controler('second-garant-termine', { francaisAdmis: [mentionGil] })
  const {
    rows: [lie],
  } = await db.query('select id, statut from dossiers where dossier_principal = $1', [dossier.id])
  assert(lie, 'Le second garant a son propre dossier lie')
  monde.noter('second garant : 2 000 et 1 500 additionnes, dossier complet a 3,5 fois le loyer')

  // --------------------------------------------- une piece a remplacer
  page = await agence.aller(`/espace/dossiers/${dossier.id}`)
  await page.locator('#pieces').waitFor()
  await agence.controler('agence-dossier-deux-garants')
  const demande = page.locator('#pieces form:has(input[name=operation][value=demander])').first()
  await demande.locator('select[name=motif]').selectOption({ index: 0 })
  await demande.locator('button').click()
  const {
    rows: [complement],
  } = await jusqua(async () => {
    const r = await db.query(
      "select id, nature, etat from complements_documentaires where dossier_id = $1 and etat = 'demande'",
      [dossier.id],
    )
    return r.rows.length ? r : null
  }, 'demande de remplacement enregistree')
  // Les courriels de statut partent au passage de la maintenance.
  await passerLaMaintenance()
  const prevenue = await courrielApplicatif(faux, premierGarant, (c) => !c.text.includes('/lien/'))
  assert(prevenue.text.includes(dossier.reference), 'Le garant est prevenu de la demande')
  monde.noter(`remplacement demande par l’agence (${complement.nature})`)

  page = await greta.aller('/garant')
  await page.locator('#complements').waitFor()
  await greta.controler('garant-remplacement-demande', { francaisAdmis: [mentionGreta] })
  // La premiere piece d'un salarie porte ses trois bulletins : le remplacement
  // doit en declarer autant, sinon le dossier redevient incomplet.
  assert.equal(complement.nature, 'bulletin_paie')
  await deposer(page, complement.nature, [await pdfFictif('remplacement', 3)], '3')
  const fournir = page.locator('#complements form:has(input[name=operation][value=fournir])')
  await fournir.locator('select[name=piece]').selectOption({ index: 1 })
  await fournir.locator('button').click()
  await jusqua(async () => {
    const r = await db.query('select etat from complements_documentaires where id = $1', [
      complement.id,
    ])
    return r.rows[0].etat === 'fourni'
  }, 'remplacement fourni')
  page = await agence.aller(`/espace/dossiers/${dossier.id}`)
  await agence.controler('agence-remplacement-fourni')
  await page.locator('#complements form:has(input[name=operation][value=valider]) button').click()
  await jusqua(async () => {
    const r = await db.query('select etat from complements_documentaires where id = $1', [
      complement.id,
    ])
    return r.rows[0].etat === 'valide'
  }, 'remplacement valide')
  await jusqua(async () => (await statut(dossier.id)) === 'complet', 'dossier de nouveau complet')
  monde.noter('remplacement fourni par le garant, valide par l’agence, dossier de nouveau complet')

  // ------------------------------------------- la recherche, puis le refus
  page = await agence.aller('/espace')
  const recherche = page.locator('form:has(input[name=reference])').first()
  await recherche.locator('input[name=reference]').fill(dossier.reference)
  await recherche.locator('button[type=submit]').click()
  await page.locator(`a[href="/espace/dossiers/${dossier.id}"]:visible`).first().waitFor()
  await agence.controler('agence-recherche-reference')
  monde.noter(`dossier retrouve par sa reference ${dossier.reference}`)

  page = await agence.aller(`/espace/dossiers/${dossier.id}`)
  const refus = page.locator('#decision form:has(input[name=confirme])')
  await refus.locator('input[name=confirme]').check()
  await refus.locator('button[type=submit]').click()
  await jusqua(async () => (await statut(dossier.id)) === 'refuse', 'dossier refuse')
  const avantRefus = faux.courriels.length
  await passerLaMaintenance()
  const annonce = await courrielApplicatif(
    faux,
    locataire,
    (c) => faux.courriels.indexOf(c) >= avantRefus,
  )
  assert(annonce.text.includes(dossier.reference), 'Le locataire est prevenu du refus')
  assert(
    !/2[\s\u202f]?000|1[\s\u202f]?500|3[,.]5/.test(annonce.text),
    'Le courriel de refus ne dit rien des revenus ni du ratio',
  )
  page = await leLocataire.aller('/locataire')
  await leLocataire.controler('locataire-refuse')
  assert.equal(await page.locator('input[name=loyer]').count(), 0, 'Le loyer ne se corrige plus')
  assert.equal(
    await page.locator('#second-garant form').count(),
    0,
    'Plus de second garant a designer',
  )
  const loyerAffiche = (await page.locator('#logement').innerText()).replace(/[\u00a0\u202f]/g, ' ')
  assert(
    loyerAffiche.includes(langue === 'en' ? '€1,000' : '1 000 €'),
    `Le loyer fige suit la langue : ${loyerAffiche}`,
  )
  monde.noter('dossier refuse : locataire prevenu, espace ferme')

  for (const acteur of [agence, leLocataire, greta, gil]) await acteur.fermer()
}
