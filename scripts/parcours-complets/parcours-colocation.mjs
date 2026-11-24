import assert from 'node:assert/strict'
import { courrielApplicatif, lienPorteur } from './acteurs.mjs'
import { completerGarant, installerAgence, mentionPour } from './etapes.mjs'
import { jusqua, texteDuPdf } from './outils.mjs'

/**
 * Une colocation de trois personnes sur un bail solidaire a 1 500 euros.
 *
 * Deux colocataires ont le meme garant : ils partagent un seul dossier et un
 * seul acte. Le troisieme a le sien. Les garants sont juges ensemble : aucun
 * ne suffit seul (2,00 et 1,33 fois le loyer), les deux ensemble si (3,33).
 */
export async function parcoursColocation(monde) {
  const { env, passage, langue } = monde
  const { db, faux } = env
  const premier = `anna.coloc.${passage}@exemple.fr`
  const troisieme = `carl.coloc.${passage}@exemple.fr`
  const garantCommun = `gina.garante.${passage}@exemple.fr`
  const garantSeul = `gus.garant.${passage}@exemple.fr`
  const statut = async (id) =>
    (await db.query('select statut from dossiers where id = $1', [id])).rows[0].statut

  // ---------------------------------------------------------------- agence
  const { agence } = await installerAgence(monde, 'c')
  let page = agence.page
  const ouverture = page.locator('form:has(textarea[name=courriels])')
  await ouverture.locator('textarea[name=courriels]').fill(`${premier}\n${troisieme}`)
  await ouverture.locator('select[name=garantCommun]').selectOption('2')
  await ouverture.locator('select[name=langueLocataire]').selectOption(langue)
  await ouverture.locator('input[name=loyerTotal]').fill('1500')
  await ouverture.locator('input[name=etendue][value=loyer_entier]').check()
  await ouverture.locator('input[name=solvabilite][value=commune]').check()
  await agence.controler('agence-colocation-formulaire')
  await ouverture.locator('button[type=submit]').click()
  const invitations = [
    await courrielApplicatif(faux, premier),
    await courrielApplicatif(faux, troisieme),
  ]
  const { rows: dossiers } = await db.query(
    `select d.id, d.reference, d.email_locataire, d.loyer_cents, d.colocataires_garantis,
            c.id as colocation, c.loyer_total_cents, c.etendue, c.solvabilite
       from dossiers d join colocations c on c.id = d.colocation_id
      where d.email_locataire = any($1) order by d.colocataires_garantis desc`,
    [[premier, troisieme]],
  )
  assert.equal(dossiers.length, 2, 'Trois colocataires, deux dossiers')
  const [commun, seul] = dossiers
  assert.equal(commun.email_locataire, premier)
  assert.equal(commun.colocataires_garantis, 2)
  assert.equal(seul.colocataires_garantis, 1)
  assert.equal(commun.colocation, seul.colocation)
  assert.equal(commun.solvabilite, 'commune')
  assert.equal(commun.etendue, 'loyer_entier')
  for (const d of dossiers)
    assert.equal(Number(d.loyer_cents), 150000, 'Chacun porte le loyer entier')
  monde.noter('colocation ouverte : trois colocataires, deux dossiers, deux liens partis')

  // ----------------------------------------------- le dossier a garant commun
  const anna = await monde.acteur('colocataire-1')
  page = await anna.aller(lienPorteur(invitations[0]))
  await page.waitForURL('**/locataire')
  const vuParAnna = await anna.texte()
  assert(!vuParAnna.includes(troisieme), 'Un colocataire ne voit pas l’adresse des autres')
  assert.equal(
    await page.locator('input[name=loyer]').count(),
    0,
    'Le loyer vient de la colocation',
  )
  await anna.controler('colocataire-arrivee')
  const designation = page.locator('form:has(select[name=langueGarant])')
  await designation.locator('input[name=courriel]').fill(garantCommun)
  await designation.locator('select[name=langueGarant]').selectOption(langue)
  await designation.locator('button[type=submit]').click()
  const invitationCommune = await courrielApplicatif(faux, garantCommun)

  const gina = await monde.acteur('garant-commun')
  page = await gina.aller(lienPorteur(invitationCommune))
  await page.waitForURL('**/garant')
  const vuParGina = (await gina.texte()).replace(/[\s  ]/g, '')
  assert(
    vuParGina.includes('1500') || vuParGina.includes('1,500'),
    'Le garant lit le loyer du bail',
  )
  assert(!(await gina.texte()).includes(troisieme), 'Le garant ne voit pas les autres colocataires')
  await gina.controler('garant-commun-arrivee')
  const mentionGina = mentionPour('Anna Coloc et Bob Coloc', 'cinquante-quatre mille', '54000')
  await completerGarant(page, {
    profil: 'salarie',
    revenu: '3000',
    plafond: '54000',
    mention: mentionGina,
    identite: { prenom: 'Gina', nom: 'Garante', adresse: '5 rue du Test, 69002 Lyon' },
  })
  await gina.controler('garant-commun-termine', { francaisAdmis: [mentionGina] })
  assert.equal(
    await statut(commun.id),
    'depot_en_cours',
    'En solvabilite commune, pas de verdict tant qu’un garant manque',
  )
  monde.noter('garant commun termine : le verdict attend l’autre garant')

  // -------------------------------------------------- le troisieme colocataire
  const carl = await monde.acteur('colocataire-3')
  page = await carl.aller(lienPorteur(invitations[1]))
  await page.waitForURL('**/locataire')
  const designationCarl = page.locator('form:has(select[name=langueGarant])')
  await designationCarl.locator('input[name=courriel]').fill(garantSeul)
  await designationCarl.locator('select[name=langueGarant]').selectOption(langue)
  await designationCarl.locator('button[type=submit]').click()
  const invitationSeule = await courrielApplicatif(faux, garantSeul)

  const gus = await monde.acteur('garant-seul')
  page = await gus.aller(lienPorteur(invitationSeule))
  await page.waitForURL('**/garant')
  const mentionGus = mentionPour('Carl Coloc', 'cinquante-quatre mille', '54000')
  await completerGarant(page, {
    profil: 'retraite',
    revenu: '2000',
    plafond: '54000',
    mention: mentionGus,
    identite: { prenom: 'Gus', nom: 'Garant', adresse: '7 rue du Test, 33000 Bordeaux' },
  })
  await gus.controler('garant-retraite-termine', { francaisAdmis: [mentionGus] })
  await jusqua(async () => (await statut(seul.id)) === 'complet', 'second dossier complet')
  assert.equal(await statut(commun.id), 'complet', 'Le verdict commun vaut pour les deux dossiers')
  const { rows: ratios } = await db.query(
    'select dossier_id, ratio from engagements where dossier_id = any($1)',
    [[commun.id, seul.id]],
  )
  const ratioDe = (id) => Number(ratios.find((r) => r.dossier_id === id).ratio)
  assert.equal(ratioDe(commun.id), 2, 'Seul, le garant commun est a 2,00')
  assert.equal(ratioDe(seul.id), 1.33, 'Seul, l’autre garant est a 1,33')
  monde.noter('solvabilite commune : 2,00 et 1,33 seuls, complets ensemble')

  // ------------------------------------------------- la fiche de la colocation
  page = await agence.aller(`/espace/colocations/${commun.colocation}`)
  await page.locator(`a[href="/espace/dossiers/${commun.id}"]`).first().waitFor()
  const fiche = (await agence.texte()).replace(/[  ]/g, ' ')
  assert.match(fiche, /3[,.]33/, 'La fiche montre le ratio commun')
  await agence.controler('agence-colocation-fiche')
  if (process.env.PARCOURS_EXPLORER) console.log(fiche)
  monde.noter('fiche de la colocation : ratio commun de 3,33 affiche')

  // Prendre les deux dossiers, puis l'acte du garant commun.
  for (const d of [commun, seul]) {
    page = await agence.aller(`/espace/dossiers/${d.id}`)
    await page
      .locator('#decision form:has(input[name=dossier]) button[type=submit]')
      .first()
      .click()
    await jusqua(async () => (await statut(d.id)) === 'transmis', `dossier ${d.reference} pris`)
  }
  await page.reload()
  await agence.controler('agence-dossier-colocation-pris')
  page = await agence.aller(`/espace/dossiers/${commun.id}/acte`)
  const acte = page.locator('form:has(select[name=civilite])')
  await acte.locator('select[name=civilite]').selectOption('madame')
  await acte.locator('input[name=naissance_le]').fill('1968-02-03')
  await acte.locator('input[name=naissance_lieu]').fill('Nantes')
  await acte.locator('input[name=locataire]').fill('Anna Coloc')
  await acte.locator('textarea[name=autres_garantis]').fill('Bob Coloc')
  await acte.locator('input[name=bailleur_nom]').fill('Bernard Bailleur')
  await acte.locator('input[name=bailleur_adresse]').fill('2 avenue du Test, 69001 Lyon')
  await acte.locator('input[name=logement]').fill('9 rue de la Colocation, 75011 Paris')
  await acte.locator('input[name=loyer]').fill('1300')
  await acte.locator('input[name=charges]').fill('200')
  await acte.locator('input[name=revision_le]').fill('2027-12-01')
  await acte.locator('select[name=irl_trimestre]').selectOption('3')
  await acte.locator('input[name=fait_lieu]').fill('Lyon')
  await agence.controler('agence-acte-colocation')
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    acte.locator('button[type=button]').first().click(),
  ])
  const morceaux = []
  for await (const m of await telechargement.createReadStream()) morceaux.push(m)
  const texteActe = await texteDuPdf(Buffer.concat(morceaux))
  for (const attendu of ['Anna Coloc', 'Bob Coloc', 'Gina', 'colocation']) {
    assert(texteActe.includes(attendu), `L’acte de colocation porte « ${attendu} »`)
  }
  assert(!texteActe.includes('Carl'), 'L’acte du garant commun ne nomme pas le troisieme')
  monde.noter('acte du garant commun : les deux colocataires garantis y sont nommes')

  for (const acteur of [agence, anna, gina, carl, gus]) await acteur.fermer()
}
