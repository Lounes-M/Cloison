import assert from 'node:assert/strict'
import { SITE } from './environnement.mjs'
import { completerGarant, installerAgence, mentionPour } from './etapes.mjs'
import { courrielApplicatif, lienPorteur } from './acteurs.mjs'
import { capturerPdf, jusqua, texteDuPdf } from './outils.mjs'

const MENTION = mentionPour('Lea Locataire', 'trente mille', '30000')

/**
 * Un dossier, un locataire, un garant : de la premiere connexion de l'agence
 * a la decision, puis a l'acte.
 */
export async function parcoursSimple(monde) {
  const { env, passage, langue } = monde
  const { db, faux } = env
  const locataire = `lea.locataire.${passage}@exemple.fr`
  const garant = `guy.garant.${passage}@exemple.fr`

  // ---------------------------------------------------------------- agence
  const { agence } = await installerAgence(monde)
  let page = agence.page
  const ouverture = page.locator('form:has(input[name=courriel]):has(input[name=loyer])').first()
  await ouverture.locator('input[name=courriel]').fill(locataire)
  await ouverture.locator('input[name=loyer]').fill('900')
  await ouverture.locator('select[name=langueLocataire]').selectOption(langue)
  await ouverture.locator('button[type=submit]').click()
  const invitation = await courrielApplicatif(faux, locataire)
  const {
    rows: [dossier],
  } = await db.query(
    'select id, reference, statut, loyer_cents, agence_id from dossiers where email_locataire = $1',
    [locataire],
  )
  assert.equal(dossier.statut, 'ouvert')
  assert.equal(Number(dossier.loyer_cents), 90000)
  assert(invitation.subject.includes(dossier.reference))
  monde.noter(`dossier ${dossier.reference} ouvert, lien du locataire parti`)

  // ------------------------------------------------------------- locataire
  const leLocataire = await monde.acteur('locataire')
  page = await leLocataire.aller(lienPorteur(invitation))
  await page.waitForURL('**/locataire')
  assert.equal(await page.locator('input[name=loyer]').inputValue(), '900')
  await leLocataire.controler('locataire-ouvert')
  const designation = page.locator('form:has(select[name=langueGarant])')
  await designation.locator('input[name=courriel]').fill(garant)
  await designation.locator('select[name=langueGarant]').selectOption(langue)
  await designation.locator('button[type=submit]').click()
  const invitationGarant = await courrielApplicatif(faux, garant)
  assert(invitationGarant.text.includes(locataire), 'Le garant sait qui le designe')
  await leLocataire.controler('locataire-garant-designe')
  monde.noter('garant designe par le locataire, lien du garant parti')

  // ---------------------------------------------------------------- garant
  const leGarant = await monde.acteur('garant')
  page = await leGarant.aller(lienPorteur(invitationGarant))
  await page.waitForURL('**/garant')
  await leGarant.controler('garant-arrivee')

  await completerGarant(page, {
    profil: 'salarie',
    revenu: '3000',
    plafond: '30000',
    mention: MENTION,
    identite: { prenom: 'Guy', nom: 'Garant', adresse: '1 rue du Test, 75001 Paris' },
  })
  const { rows: pieces } = await db.query(
    'select type, nombre_documents, type_reel from pieces where dossier_id = $1 order by type',
    [dossier.id],
  )
  assert.deepEqual(
    pieces.map((p) => `${p.type}:${p.nombre_documents}:${p.type_reel}`),
    [
      'avis_imposition:1:application/pdf',
      'bulletin_paie:3:application/pdf',
      'justificatif_domicile:1:image/jpeg',
      'piece_identite:1:application/pdf',
    ],
    'Deux photos d’identite reunies en un PDF, une facture restee en photo',
  )
  monde.noter('engagement, quatre pieces (dont deux photos reunies en un PDF) et mention du garant')
  await leGarant.controler('garant-mention-apposee', { francaisAdmis: [MENTION] })
  const {
    rows: [apres],
  } = await db.query('select statut from dossiers where id = $1', [dossier.id])
  assert.equal(apres.statut, 'complet', 'Un revenu de 3,33 fois le loyer suffit au seuil de 3')
  monde.noter('dossier complet a 3,33 fois le loyer')

  // ------------------------------------------------- l'agence examine
  page = await agence.aller(`/espace/dossiers/${dossier.id}`)
  await page.locator('#pieces').waitFor()
  await agence.controler('agence-dossier-complet')
  const chiffres = async (locator) => (await locator.innerText()).replace(/[^\d%]/g, '')
  assert.match(
    await chiffres(page.locator('main')),
    /333×?300/,
    'Le ratio 3,33 est affiche face au seuil',
  )

  // Chaque piece s'ouvre filigranee, et l'ouverture s'inscrit au journal.
  const liens = await page
    .locator('a[href^="/espace/pieces/"]')
    .evaluateAll((l) => l.map((a) => a.getAttribute('href')))
  assert.equal(liens.length, 4)
  for (const lien of liens) {
    const piece = await page.request.get(`${SITE}${lien}`)
    assert.equal(piece.status(), 200, `Ouverture de ${lien}`)
    assert.match(piece.headers()['content-type'], /^application\/pdf/)
    assert.equal((await piece.body()).subarray(0, 5).toString(), '%PDF-')
  }
  const {
    rows: [{ count: consultations }],
  } = await db.query(
    "select count(*) from journal_acces where dossier_id = $1 and action = 'piece_ouverte'",
    [dossier.id],
  )
  assert.equal(Number(consultations), 4, 'Quatre consultations au journal')
  monde.noter('quatre pieces ouvertes filigranees par l’agence, quatre lignes au journal')

  // La comparaison IA du revenu declare aux pieces : 3 000 declares, 2 400 lus.
  faux.etat.net = '2400.00'
  const comparaison = page.locator('#engagement details').filter({
    has: page.locator('input[type=checkbox]'),
  })
  await comparaison.locator('summary').click()
  assert(await comparaison.locator('button.btn-principal').isDisabled(), 'Sans accord, pas d’envoi')
  await comparaison.locator('input[type=checkbox]').check()
  const [reponseComparaison] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/comparaison')),
    comparaison.locator('button.btn-principal').click(),
  ])
  assert.equal(reponseComparaison.status(), 200, 'La comparaison aboutit')
  await comparaison.locator('[role=status] dl').waitFor()
  const lu = await chiffres(comparaison.locator('[role=status]'))
  assert(lu.includes('3000') && lu.includes('2400') && lu.includes('25%'), `Comparaison : ${lu}`)
  assert(
    faux.appels.some((a) => a.chemin === '/openrouter/api/v1/chat/completions'),
    'Le modele a bien ete interroge',
  )
  await agence.controler('agence-comparaison-revenus')
  monde.noter('comparaison IA : 3 000 declares, 2 400 lus, ecart de 25 % signale')

  // L'examen humain de chaque piece.
  const nombreExamens = await page.locator('form:has(select[name=etat])').count()
  assert.equal(nombreExamens, 4)
  for (let i = 0; i < nombreExamens; i++) {
    const volet = page.locator('details:has(select[name=etat])').nth(i)
    if (!(await volet.evaluate((d) => d.open))) await volet.locator('summary').click()
    const examen = volet.locator('form:has(select[name=etat])')
    await examen.locator('select[name=etat]').selectOption('examine')
    await examen.locator('input[name=confirmation]').check()
    await examen.locator('button').click()
    await jusqua(
      async () => {
        const { rows } = await db.query(
          "select count(*) from examens_documentaires e join pieces p on p.id = e.piece_id where p.dossier_id = $1 and e.etat = 'examine'",
          [dossier.id],
        )
        return Number(rows[0].count) === i + 1
      },
      `examen ${i + 1} enregistre`,
    )
  }
  monde.noter('quatre pieces marquees examinees')

  // La synthese pour le bailleur : le ratio, jamais le revenu.
  const synthese = await page.request.get(`${SITE}/espace/dossiers/${dossier.id}/synthese`)
  assert.equal(synthese.status(), 200)
  // Le PDF est une image filigranee au nom du collaborateur : son texte ne
  // se relit pas ici. La capture rendue permet de le relire a l'oeil.
  assert.equal((await synthese.body()).subarray(0, 5).toString(), '%PDF-')
  assert.match(
    synthese.headers()['content-disposition'],
    /^attachment; filename="[a-z-]+-\w*\.pdf"$/,
  )
  await capturerPdf(monde, 'agence-synthese-bailleur', await synthese.body())
  const {
    rows: [{ count: syntheses }],
  } = await db.query(
    "select count(*) from journal_acces where dossier_id = $1 and action = 'synthese_bailleur'",
    [dossier.id],
  )
  assert.equal(Number(syntheses), 1, 'Le telechargement de la synthese est au journal')
  monde.noter('synthese bailleur telechargee, inscrite au journal')

  // La prise du dossier, puis le modele d'acte.
  await page.reload()
  await page.locator('#decision form:has(input[name=dossier]) button[type=submit]').first().click()
  await jusqua(async () => {
    const { rows } = await db.query('select statut from dossiers where id = $1', [dossier.id])
    return rows[0].statut === 'transmis'
  }, 'dossier transmis')
  await page.locator(`a[href="/espace/dossiers/${dossier.id}/acte"]`).first().waitFor()
  await agence.controler('agence-dossier-pris')
  monde.noter('dossier pris par l’agence')

  await page.locator(`a[href="/espace/dossiers/${dossier.id}/acte"]`).first().click()
  await page.waitForURL('**/acte')
  const acte = page.locator('form:has(select[name=civilite])')
  await acte.locator('select[name=civilite]').selectOption('monsieur')
  await acte.locator('input[name=naissance_le]').fill('1970-05-17')
  await acte.locator('input[name=naissance_lieu]').fill('Lyon')
  await acte.locator('input[name=locataire]').fill('Lea Locataire')
  await acte.locator('input[name=bailleur_nom]').fill('Bernard Bailleur')
  await acte.locator('input[name=bailleur_adresse]').fill('2 avenue du Test, 69001 Lyon')
  await acte.locator('input[name=logement]').fill('3 rue du Parcours, 75011 Paris')
  await acte.locator('input[name=loyer]').fill('800')
  await acte.locator('input[name=charges]').fill('100')
  await acte.locator('input[name=revision_le]').fill('2027-12-01')
  await acte.locator('select[name=irl_trimestre]').selectOption('3')
  await acte.locator('input[name=fait_lieu]').fill('Paris')
  await agence.controler('agence-acte-formulaire')
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    acte.locator('button[type=button]').first().click(),
  ])
  const flux = await telechargement.createReadStream()
  const morceaux = []
  for await (const m of flux) morceaux.push(m)
  const texteActe = await texteDuPdf(Buffer.concat(morceaux))
  for (const attendu of ['Bernard Bailleur', 'Lea Locataire', 'Guy', 'Garant', 'Lyon']) {
    assert(texteActe.includes(attendu), `L’acte porte « ${attendu} »`)
  }
  assert.match(texteActe.replace(/\s/g, ''), /30000/, 'L’acte porte le plafond de 30 000 euros')
  monde.noter('modele d’acte de cautionnement telecharge et relu')

  // Ce que voient le locataire et le garant une fois le dossier pris.
  page = await leLocataire.aller('/locataire')
  await leLocataire.controler('locataire-dossier-pris')
  page = await leGarant.aller('/garant')
  assert.equal(await page.locator('input[name=fichier]').count(), 0, 'Depot ferme apres la prise')
  await leGarant.controler('garant-dossier-pris', { francaisAdmis: [MENTION] })
  monde.noter('locataire et garant voient le dossier pris, depot ferme')

  await agence.fermer()
  await leLocataire.fermer()
  await leGarant.fermer()
}
