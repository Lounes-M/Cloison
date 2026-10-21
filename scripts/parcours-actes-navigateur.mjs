import { PDFDocument } from 'pdf-lib'
import assert from 'node:assert/strict'
import { parcourirExport } from './parcours-exports-navigateur.mjs'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { auditerAccessibilite } from './audit-accessibilite.mjs'

// Meme format que lib/coffre/enveloppe (nonce, marque, chiffre) et que
// lib/signature/archive-format (contexte authentifie de chaque fichier).
function ouvrirCleActe(scellee, cleMaitresse) {
  const octets = Buffer.from(scellee.slice(2), 'hex')
  const dechiffre = createDecipheriv('aes-256-gcm', cleMaitresse, octets.subarray(0, 12))
  dechiffre.setAuthTag(octets.subarray(12, 28))
  return Buffer.concat([dechiffre.update(octets.subarray(28)), dechiffre.final()])
}
function scellerFichier(pdf, cle, f) {
  const chiffre = createCipheriv('aes-256-gcm', cle, Buffer.from(f.nonce.slice(2), 'hex'))
  chiffre.setAAD(
    Buffer.from(
      JSON.stringify(['cloison-acte-v1', f.acte_id, f.id, f.nature, f.empreinte, f.taille]),
    ),
  )
  return Buffer.concat([chiffre.update(pdf), chiffre.final(), chiffre.getAuthTag()])
}

export function fixtureActes(dossier, cleMaitresse) {
  let active = false,
    listesRemplies = false,
    acte = null,
    demande = null,
    fichiers = [],
    objets = new Map(),
    reglements = []
  return {
    activer() {
      active = true
      listesRemplies = false
      acte = null
      demande = null
      fichiers = []
      objets = new Map()
      reglements = []
    },
    desactiver() {
      active = false
    },
    lire: () => acte,
    reglements: () => reglements,
    remplirListes() {
      listesRemplies = true
    },
    /** Etat final du fournisseur : PDF signe et preuve chiffres avec la cle de l'acte. */
    async archiver() {
      const cle = ouvrirCleActe(acte.cle_scellee, cleMaitresse)
      const originaux = {}
      try {
        for (const nature of ['acte', 'preuve']) {
          const pdf = await pdfRecette(`Recette ${nature} signe sans engagement`)
          const f = {
            id: randomUUID(),
            acte_id: acte.id,
            nature,
            empreinte: createHash('sha256').update(pdf).digest('hex'),
            taille: pdf.length,
            nonce: '\\x' + randomBytes(12).toString('hex'),
            confirme: true,
          }
          objets.set(`${acte.id}/${f.id}`, scellerFichier(pdf, cle, f))
          fichiers.push(f)
          originaux[nature] = pdf
        }
      } finally {
        cle.fill(0)
      }
      acte.etape = 'archive'
      demande.etat = 'done'
      return originaux
    },
    traiter(req, res, brut) {
      const chemin = new URL(req.url, 'http://fixture.invalid').pathname
      if (!active) {
        if (chemin.endsWith('/rpc/actes_du_dossier')) {
          res.setHeader('Content-Type', 'application/json')
          res.end('[]')
          return true
        }
        return false
      }
      let resultat
      if (chemin.includes('/storage/v1/object/')) {
        const cle = chemin.split('/actes/')[1]
        if (!cle) return false
        if (req.method === 'POST') {
          objets.set(cle, Buffer.from(brut))
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ Key: `actes/${cle}` }))
          return true
        }
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/octet-stream')
          res.end(objets.get(cle))
          return true
        }
        return false
      }
      const p = brut.length ? JSON.parse(brut.toString()) : {}
      if (chemin.endsWith('/dossiers'))
        resultat = [
          {
            id: dossier,
            statut: 'transmis',
            email_garant: 'garant@example.invalid',
            expire_le: new Date(Date.now() + 7 * 86400000).toISOString(),
            demonstration: false,
          },
        ]
      else if (chemin.endsWith('/rpc/consommer_debit')) resultat = true
      else if (chemin.endsWith('/engagements'))
        resultat = [
          {
            nom: 'Fictif',
            prenom: 'Essai',
            mention: 'Mention personnelle fictive de recette',
            mention_saisie_le: new Date().toISOString(),
            version_conditions: 1,
          },
        ]
      else if (chemin.endsWith('/rpc/preparer_acte_signature')) {
        acte = {
          id: p.le_id,
          agence_id: dossier,
          modele: p.le_modele,
          version_conditions: p.la_version,
          cle_scellee: p.cle,
          contexte_chiffre: p.contexte,
          expire_signature: p.expiration,
          conserver_jusqu_au: p.conservation,
          etape: 'preparation',
          document_fournisseur: null,
          signataire_fournisseur: null,
          operation: null,
        }
        demande = {
          id: p.le_id,
          environnement: p.le_mode,
          etat: 'draft',
          empreinte_acte: p.empreinte,
        }
        resultat = p.le_id
      } else if (chemin.endsWith('/rpc/reserver_fichier_signature')) {
        resultat = {
          id: randomUUID(),
          acte_id: p.le_id,
          nature: p.la_nature,
          empreinte: p.empreinte,
          taille: p.taille,
          nonce: p.nonce,
          confirme: false,
        }
        fichiers.push(resultat)
      } else if (chemin.endsWith('/rpc/confirmer_fichier_signature')) {
        fichiers.find((f) => f.id === p.le_fichier).confirme = true
        acte.etape = 'a_valider'
        resultat = true
      } else if (chemin.endsWith('/rpc/lire_acte_signature'))
        resultat = acte ? { acte, demande, fichiers } : null
      else if (chemin.endsWith('/rpc/journaliser_lecture_acte')) resultat = true
      else if (chemin.endsWith('/rpc/valider_acte_signature')) {
        assert.equal(p.empreinte, demande.empreinte_acte)
        acte.etape = p.accepter ? 'valide' : 'refuse'
        resultat = true
      } else if (chemin.endsWith('/rpc/reserver_reglement_acte')) {
        resultat = {
          id: randomUUID(),
          facture: p.la_facture,
          montant: 2900,
          tarif: 'recette',
          session: null,
          cree_le: new Date().toISOString(),
        }
        reglements.push(resultat)
      } else if (chemin.endsWith('/rpc/actes_du_dossier'))
        resultat = acte
          ? [
              {
                id: acte.id,
                modele: acte.modele,
                etape: acte.etape,
                environnement: 'sandbox',
                etat: 'draft',
              },
            ]
          : []
      else if (chemin.endsWith('/rpc/archives_de_mon_agence'))
        resultat = listesRemplies
          ? [
              {
                id: acte.id,
                modele: 'Modèle de recette avec une référence longue pour la vérification mobile',
                archive_le: '2026-09-23T12:00:00Z',
                conserver_jusqu_au: '2031-09-23T12:00:00Z',
                environnement: 'sandbox',
              },
            ]
          : []
      else if (chemin.endsWith('/rpc/factures_de_mon_agence'))
        resultat = listesRemplies
          ? [
              {
                id: acte.id,
                montant_cents: 2900,
                rembourse_cents: null,
                cree_le: '2026-09-23T12:00:00Z',
                paye_le: null,
                tarif_version: 'recette',
                etat: 'a_regler',
                anomalie: false,
              },
              {
                id: dossier,
                montant_cents: 5800,
                rembourse_cents: 0,
                cree_le: '2026-09-22T12:00:00Z',
                paye_le: null,
                tarif_version: 'recette',
                etat: 'litige',
                anomalie: true,
              },
            ]
          : []
      else return false
      res.setHeader('Content-Type', 'application/json')
      if (req.headers.accept?.includes('vnd.pgrst.object') && Array.isArray(resultat))
        resultat = resultat[0] ?? null
      res.end(JSON.stringify(resultat))
      return true
    },
  }
}
export async function parcourirActes(page, site, dossier, moteur, largeur, fixture, visiter) {
  fixture.activer()
  try {
    await visiter(`/espace/dossiers/${dossier}/signature`, 'preparation-acte')
    await page.getByRole('heading', { name: 'Préparer l’acte', exact: true }).waitFor()
    await page.locator('input[name="pdf"]').setInputFiles({
      name: 'acte-recette.pdf',
      mimeType: 'application/pdf',
      buffer: await pdfRecette(),
    })
    await page.locator('input[name="telephone"]').fill('+33600000000')
    await page.getByRole('button', { name: 'Afficher la page', exact: true }).click()
    const apercu = page.getByRole('button', {
      name: 'Page de l’acte : placement du champ de signature',
      exact: true,
    })
    await apercu.waitFor()
    await apercu.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    assert.equal(await page.locator('input[name="x"]').inputValue(), '41')
    assert.equal(await page.locator('input[name="y"]').inputValue(), '50')
    const boite = await apercu.boundingBox()
    assert(boite)
    await apercu.click({ position: { x: boite.width - 5, y: boite.height - 5 } })
    assert.equal(await page.locator('input[name="x"]').inputValue(), '510')
    assert.equal(await page.locator('input[name="y"]').inputValue(), '805')
    await page.locator('input[name="page"]').fill('2')
    assert.equal(await apercu.count(), 0, 'Une autre page ne conserve pas l ancien apercu')
    await page.locator('input[name="page"]').fill('1')
    await page.getByRole('button', { name: 'Afficher la page', exact: true }).click()
    await apercu.waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    if (process.env.CLOISON_CAPTURE_INTERFACE_DIR) {
      await mkdir(process.env.CLOISON_CAPTURE_INTERFACE_DIR, { recursive: true })
      await page.screenshot({
        path: join(process.env.CLOISON_CAPTURE_INTERFACE_DIR, `placement-acte-${largeur}.png`),
        fullPage: true,
      })
    }
    await page.locator('input[name="accord"]').check()
    await page.getByRole('button', { name: 'Soumettre au garant', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('link', { name: 'Ouvrir le suivi de l’acte' }).waitFor()
    await visiter(`/espace/actes/${fixture.lire().id}`, 'suivi-acte')
    await page.getByRole('heading', { name: 'Signature de l’acte', exact: true }).waitFor()
    const lien = page.getByRole('link', { name: 'Consulter le projet PDF', exact: true })
    const [telechargement] = await Promise.all([page.waitForEvent('download'), lien.click()])
    assert.equal(telechargement.suggestedFilename(), 'cloison-projet.pdf')
    await visiter(`/garant/actes/${fixture.lire().id}`, 'validation-acte')
    await page.getByRole('button', { name: 'Valider pour signature', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Opération non confirmée' }).waitFor()
    assert.equal(fixture.lire().etape, 'a_valider')
    await page.locator('input[name="accord"]').check()
    await page.getByRole('button', { name: 'Valider pour signature', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByText('Envoi à préparer', { exact: false }).waitFor()
    assert.equal(fixture.lire().etape, 'valide')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await auditerAccessibilite(page, `validation-acte-confirmee ${moteur.name()} ${largeur}`)
    const originaux = await fixture.archiver()
    for (const [chemin, nom] of [
      [`/espace/actes/${fixture.lire().id}`, 'acte-archive'],
      [`/garant/actes/${fixture.lire().id}`, 'acte-archive-garant'],
    ]) {
      await visiter(chemin, nom)
      await page.getByText('Signature terminée', { exact: false }).waitFor()
      const documents = page.getByRole('list', { name: 'Documents disponibles', exact: true })
      for (const [nature, libelle] of [
        ['acte', 'Télécharger l’acte signé'],
        ['preuve', 'Télécharger la preuve de signature'],
      ]) {
        const lien = documents.getByRole('link', { name: libelle, exact: true })
        await lien.focus()
        const [telechargement] = await Promise.all([
          page.waitForEvent('download'),
          page.keyboard.press('Enter'),
        ])
        assert.equal(telechargement.suggestedFilename(), `cloison-${nature}.pdf`)
        // Restitution sans transformation : un filigrane invaliderait la signature.
        assert(
          (await readFile(await telechargement.path())).equals(originaux[nature]),
          `Original ${nature} modifie ${nom}`,
        )
      }
    }
    await visiter(`/espace/actes/${fixture.lire().id}`, 'acte-archive-retour')
    for (const chemin of ['/espace/archives', '/espace/facturation']) {
      await visiter(chemin, chemin.endsWith('archives') ? 'archives' : 'facturation')
      await page.locator('h1').waitFor()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    }
    fixture.remplirListes()
    await visiter('/espace/archives', 'archives-remplies')
    const archive = page.getByRole('link', { name: /Modèle de recette avec une référence longue/ })
    assert.equal(await archive.getAttribute('href'), `/espace/actes/${fixture.lire().id}`)
    await parcourirExport(page, 'archives', fixture.lire().id)
    await archive.focus()
    assert(await archive.evaluate((e) => document.activeElement === e))
    await visiter('/espace/facturation', 'facturation-remplie')
    const anomalie = page.getByRole('listitem').filter({ hasText: 'Rapprochement à examiner' })
    await anomalie.waitFor()
    assert.equal(
      await anomalie.getByRole('button', { name: 'Régler par carte', exact: true }).count(),
      0,
      'Un reglement a rapprocher ne doit pas etre propose au paiement',
    )
    await parcourirExport(page, 'reglements', fixture.lire().id)
    const regler = page
      .getByRole('listitem')
      .filter({ hasText: 'À régler' })
      .getByRole('button', { name: 'Régler par carte', exact: true })
    await regler.focus()
    await page.keyboard.press('Enter')
    // Sans Stripe dans le harnais, la reservation aboutit au refus prudent et explique.
    await page.waitForURL((u) => u.searchParams.get('paiement') === 'indisponible')
    assert.equal(new URL(page.url()).origin, new URL(site).origin, 'Aucune sortie vers Checkout')
    await page
      .getByRole('status')
      .filter({ hasText: 'Le paiement n’a pas pu être confirmé.' })
      .waitFor()
    assert.deepEqual(
      fixture.reglements().map((r) => r.facture),
      [fixture.lire().id],
      'Une seule reservation pour la facture choisie',
    )
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await auditerAccessibilite(page, `paiement-indisponible ${moteur.name()} ${largeur}`)
    console.log(
      `OK : acte ${moteur.name()} ${largeur}, depot chiffre, original, consentement explicite, archive signee intacte, reglement clavier et espaces archives/reglements`,
    )
  } finally {
    fixture.desactiver()
  }
}

async function pdfRecette(texte = 'Recette sans engagement') {
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842]).drawText(texte, { x: 40, y: 740 })
  return Buffer.from(await pdf.save())
}
