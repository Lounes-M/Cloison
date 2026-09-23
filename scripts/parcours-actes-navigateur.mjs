import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
export function fixtureActes(dossier) {
  let active = false,
    acte = null,
    demande = null,
    fichiers = [],
    objets = new Map()
  return {
    activer() {
      active = true
      acte = null
      demande = null
      fichiers = []
      objets = new Map()
    },
    desactiver() {
      active = false
    },
    lire: () => acte,
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
      else if (chemin.endsWith('/rpc/archives_de_mon_agence')) resultat = []
      else if (chemin.endsWith('/rpc/factures_de_mon_agence')) resultat = []
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
      buffer: Buffer.from('%PDF-1.7\nRecette sans engagement\n%%EOF'),
    })
    await page.locator('input[name="telephone"]').fill('+33600000000')
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
    for (const chemin of ['/espace/archives', '/espace/facturation']) {
      await visiter(chemin, chemin.endsWith('archives') ? 'archives' : 'facturation')
      await page.locator('h1').waitFor()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    }
    console.log(
      `OK : acte ${moteur.name()} ${largeur}, depot chiffre, original, consentement explicite, clavier et espaces archives/reglements`,
    )
  } finally {
    fixture.desactiver()
  }
}
