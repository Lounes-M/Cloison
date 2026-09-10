import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'

/** Seulement le build et les fixtures du harnais local, jamais une session utilisateur. */
export async function verifierNavigateurPorteurs({ site, cookies, db, dossierId, autreId }) {
  const origine = new URL(site)
  assert(['127.0.0.1', 'localhost'].includes(origine.hostname), 'Site local obligatoire')
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress),
    'Connexion PostgreSQL locale obligatoire',
  )
  for (const moteur of [chromium, firefox, webkit]) {
    await verifierMoteur({ moteur, site, origine, cookies, db, dossierId, autreId })
  }
}

async function verifierMoteur({ moteur, site, origine, cookies, db, dossierId, autreId }) {
  const navigateur = await moteur.launch()
  async function attendre(lire, attendu) {
    for (let i = 0; i < 50; i++) {
      if ((await lire()) === attendu) return
      await new Promise((r) => setTimeout(r, 100))
    }
    assert.equal(await lire(), attendu, 'Mutation navigateur non confirmee en base')
  }
  const limite = setTimeout(() => {
    void navigateur.close().catch(() => {})
  }, 120000)
  try {
    const piece = (await db.query('select id from pieces where dossier_id=$1 limit 1', [dossierId]))
      .rows[0].id
    for (const largeur of [390, 1280]) {
      // Chaque passage doit produire une mutation, meme apres un autre moteur.
      await db.query("update engagements set profil_ressources='salarie' where dossier_id=$1", [
        dossierId,
      ])
      await db.query('update pieces set nombre_documents=1 where id=$1', [piece])
      const contexte = await navigateur.newContext({
        viewport: { width: largeur, height: 900 },
        serviceWorkers: 'block',
      })
      try {
        await contexte.route('**/*', (route) =>
          new URL(route.request().url()).origin === origine.origin
            ? route.continue()
            : route.abort(),
        )
        const separateur = cookies.garant.indexOf('=')
        await contexte.addCookies([
          {
            name: cookies.garant.slice(0, separateur),
            value: cookies.garant.slice(separateur + 1),
            url: site,
            httpOnly: true,
            sameSite: 'Lax',
          },
        ])
        const page = await contexte.newPage()
        page.setDefaultTimeout(10000)
        async function soumettre(form) {
          const [reponse] = await Promise.all([
            page.waitForResponse(
              (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/garant',
            ),
            form.getByRole('button').press('Enter'),
          ])
          assert.equal(reponse.status(), 200, 'Action navigateur refusee au transport')
          return reponse
        }
        await page.goto(`${site}/garant`)
        const profil = page.getByLabel('Ta situation professionnelle')
        let atteint = false
        for (let i = 0; i < 60; i++) {
          await page.keyboard.press('Tab')
          if (await profil.evaluate((element) => element === document.activeElement)) {
            atteint = true
            break
          }
        }
        assert(atteint, 'Profil accessible au clavier')
        await page.getByLabel('Ta situation professionnelle').selectOption('retraite')
        const engagement = page
          .locator('form')
          .filter({ has: page.locator('select[name="profil"]') })
        await engagement.locator('input[name="revenu"]').fill('3200')
        await engagement.locator('input[name="montant"]').fill('12000')
        await engagement
          .locator('input[name="jusquAu"]')
          .fill(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10))
        await soumettre(engagement)
        await attendre(
          async () =>
            (
              await db.query('select profil_ressources from engagements where dossier_id=$1', [
                dossierId,
              ])
            ).rows[0].profil_ressources,
          'retraite',
        )
        await page.reload()
        assert.equal(await page.getByLabel('Ta situation professionnelle').inputValue(), 'retraite')
        assert((await page.getByText('Droits à la retraite', { exact: true }).count()) > 0)
        const nombre = page
          .locator('form')
          .filter({ has: page.locator(`input[name="piece"][value="${piece}"]`) })
          .filter({ has: page.locator('select[name="nombre_documents"]') })
        await nombre.locator('select').selectOption('3')
        await soumettre(nombre)
        await attendre(
          async () =>
            (await db.query('select nombre_documents from pieces where id=$1', [piece])).rows[0]
              .nombre_documents,
          3,
        )
        await nombre.locator('select').selectOption('2')
        await nombre.evaluate((form, valeur) => {
          form.addEventListener('formdata', (event) => event.formData.set('dossier', valeur), {
            once: true,
          })
        }, autreId)
        const falsifiee = await soumettre(nombre)
        assert(
          falsifiee.request().postData().includes(autreId),
          'Dossier falsifie effectivement envoye',
        )
        assert.equal(
          (await db.query('select nombre_documents from pieces where id=$1', [piece])).rows[0]
            .nombre_documents,
          3,
          'Ancien formulaire refuse',
        )
        await nombre.getByRole('alert').waitFor()

        // La demande et le fichier sont des fixtures ; la proposition passe par le vrai formulaire.
        const demande = (
          await db.query(
            "insert into complements_documentaires(dossier_id,piece_initiale,pieces_ecartees,nature,motif) values($1,$2,array[$2::uuid],'bulletin_paie','illisible') returning id",
            [dossierId, piece],
          )
        ).rows[0].id
        const nouveau = (await db.query('select gen_random_uuid() id')).rows[0].id
        const chemin = `${dossierId}/${nouveau}`
        await db.query('insert into reservations_depot(chemin,dossier_id) values($1,$2)', [
          chemin,
          dossierId,
        ])
        await db.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [chemin])
        await db.query(
          "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel,nombre_documents,depose_le) values($1,$2,'bulletin_paie',$3,100,'application/pdf',3,clock_timestamp())",
          [nouveau, dossierId, chemin],
        )
        await page.reload()
        const complement = page
          .locator('form')
          .filter({ has: page.locator('input[name="operation"][value="fournir"]') })
        await complement.locator('select[name="piece"]').selectOption(nouveau)
        await soumettre(complement)
        await attendre(
          async () =>
            (await db.query('select etat from complements_documentaires where id=$1', [demande]))
              .rows[0].etat,
          'fourni',
        )
        await page.reload()
        assert(await page.getByText('Remplacement à examiner', { exact: true }).isVisible())
        assert.equal(await page.locator('input[name="operation"][value="valider"]').count(), 0)
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          'Aucun debordement horizontal',
        )
        await db.query('delete from complements_documentaires where id=$1', [demande])
        await db.query('delete from pieces where id=$1', [nouveau])
        console.log(
          `OK : ${moteur.name()} ${largeur}px, clavier, profil, quantite, formulaire falsifie et complement confirmes en SQL`,
        )
      } finally {
        await contexte.close()
      }
    }
    const contexte = await navigateur.newContext()
    try {
      await contexte.route('**/*', (route) =>
        new URL(route.request().url()).origin === origine.origin ? route.continue() : route.abort(),
      )
      const i = cookies.locataire.indexOf('=')
      await contexte.addCookies([
        {
          name: cookies.locataire.slice(0, i),
          value: cookies.locataire.slice(i + 1),
          url: site,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ])
      const page = await contexte.newPage()
      await page.goto(`${site}/garant`)
      assert.equal(new URL(page.url()).pathname, '/locataire')
      assert(!(await page.content()).includes('CONFIDENTIELPARCOURS'))
      assert.equal(await page.locator('input[name="operation"]').count(), 0)
      const fige = await page.content()
      await page.route('**/locataire', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: fige }),
      )
      const avantLien = (
        await db.query(
          "select emis_le,expire_le from jetons_actifs where dossier_id=$1 and partie='locataire'",
          [dossierId],
        )
      ).rows[0]
      await db.query(
        "update jetons_actifs set emis_le=now()-interval '2 minutes',expire_le=now()-interval '1 minute' where dossier_id=$1 and partie='locataire'",
        [dossierId],
      )
      try {
        await page.reload()
        assert.equal(new URL(page.url()).pathname, '/lien-invalide', 'Session expiree refusee')
        assert(!(await page.content()).includes('PARCOURS1234'))
      } finally {
        await db.query(
          "update jetons_actifs set emis_le=$2,expire_le=$3 where dossier_id=$1 and partie='locataire'",
          [dossierId, avantLien.emis_le, avantLien.expire_le],
        )
      }
      console.log(`OK : ${moteur.name()} locataire cloisonne et session expiree refusee`)
    } finally {
      await contexte.close()
    }
  } finally {
    clearTimeout(limite)
    await navigateur.close()
  }
}
