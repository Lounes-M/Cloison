import assert from 'node:assert/strict'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SignJWT } from 'jose'
import { createHmac } from 'node:crypto'
import { parcourirSupport } from './parcours-support-navigateur.mjs'

async function verifierCommandes(page, nom) {
  const commandes = await page
    .locator('button, a.press, .lien-espace, summary')
    .evaluateAll((elements) =>
      elements
        .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
        .map((e) => ({
          libelle: e.textContent.trim(),
          hauteur: e.getBoundingClientRect().height,
          largeur: e.clientWidth,
          contenu: e.scrollWidth,
        }))
        // Une translation animee peut rendre 43.999969 px pour une boite de 44 px.
        // Comparer au centieme de pixel CSS, sans accepter une commande de 43.5 px.
        .filter((e) => Math.round(e.hauteur * 100) / 100 < 44 || e.contenu > e.largeur + 1),
    )
  assert.deepEqual(commandes, [], `Commande tronquee ou trop petite ${nom}`)
}

async function verifierPrecisionTactile(contexte) {
  const preuve = await contexte.newPage()
  try {
    await preuve.setContent(
      '<div style="margin-top:300px"><button style="display:inline-flex;box-sizing:border-box;height:44px;min-height:0;width:200px;border:0;padding:0">Tactile</button></div>',
    )
    for (const translation of [0.17, 0.42, 0.67, 0.92]) {
      await preuve.locator('div').evaluate((e, y) => {
        e.style.transform = `translateY(${y}px)`
      }, translation)
      await verifierCommandes(preuve, 'translation fractionnaire')
    }
    await preuve.locator('button').evaluate((e) => {
      e.style.height = '43.5px'
    })
    await assert.rejects(
      verifierCommandes(preuve, 'hauteur insuffisante'),
      /Commande tronquee ou trop petite/,
    )
    await preuve.locator('button').evaluate((e) => {
      e.style.height = '44px'
      e.style.width = '20px'
    })
    await assert.rejects(
      verifierCommandes(preuve, 'texte tronque'),
      /Commande tronquee ou trop petite/,
    )
  } finally {
    await preuve.close()
  }
  console.log(
    'OK : precision tactile, translations fractionnaires, hauteur insuffisante et texte tronque',
  )
}

async function verifierSurface(page) {
  const couleurs = await page
    .locator('.espace-shell')
    .first()
    .evaluate((el) => {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-cream')
        .trim()
      const n = Number.parseInt(token.slice(1), 16)
      return {
        fond: getComputedStyle(el).backgroundColor,
        attendu: `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`,
        defilement: getComputedStyle(document.documentElement).scrollBehavior,
      }
    })
  assert.equal(couleurs.fond, couleurs.attendu, 'Le fond de marque est absent')
  assert.equal(couleurs.defilement, 'auto', 'Le defilement applicatif doit rester immediat')
}

/** Rendus et acces clavier sur les pages reelles, donnees du faux fournisseur local. */
export async function parcourirInterface(page, site, id, moteur, largeur, session, simulerPanne) {
  const routesVues = new Set()
  const contexte = page.context()
  if (moteur.name() === 'chromium' && largeur === 320) await verifierPrecisionTactile(contexte)
  const repertoire = process.env.CLOISON_CAPTURE_INTERFACE_DIR
  if (repertoire) await mkdir(repertoire, { recursive: true })
  const visiter = async (chemin, nom, shell = true) => {
    routesVues.add(chemin.replace(id, '[id]'))
    await page.goto(site + chemin)
    await page.locator('h1').first().waitFor()
    assert.equal(new URL(page.url()).pathname, chemin, `Route non rendue ${nom}`)
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.locator('h1').count(), 1, 'Titre de page unique')
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Debordement interface ${nom}`,
    )
    if (largeur < 768) {
      const champs = await page
        .locator(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea',
        )
        .evaluateAll((elements) =>
          elements
            .filter((e) => e.getClientRects().length)
            .filter((e) => Number.parseFloat(getComputedStyle(e).fontSize) < 16)
            .map((e) => e.name || e.id),
        )
      assert.deepEqual(champs, [], `Champs trop petits sur mobile ${nom}`)
      await verifierCommandes(page, nom)
      const motsCoupes = await page.locator('.entete-espace h1').evaluateAll((elements) => {
        const resultat = []
        for (const e of elements) {
          const texte = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
          while (texte.nextNode())
            for (const mot of texte.currentNode.textContent.matchAll(/\p{L}+/gu)) {
              const plage = document.createRange()
              plage.setStart(texte.currentNode, mot.index)
              plage.setEnd(texte.currentNode, mot.index + mot[0].length)
              if (plage.getClientRects().length > 1) resultat.push(mot[0])
            }
        }
        return resultat
      })
      assert.deepEqual(motsCoupes, [], `Mot coupe dans le titre ${nom}`)
    }
    if (shell) await verifierSurface(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const entete = page.locator('.entete-espace')
    if (await entete.count())
      assert.equal(await entete.evaluate((e) => getComputedStyle(e).animationName), 'none')
    if (repertoire && moteur.name() === 'chromium')
      await page.screenshot({
        path: join(repertoire, `${nom}-${largeur}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  }
  await visiter('/espace', 'tableau')
  const dossiers = page.getByRole('list', { name: 'Vos dossiers', exact: true })
  const recherche = page.locator('form[method="get"] input')
  assert.deepEqual(
    await recherche.evaluateAll((elements) =>
      elements.filter((e) => e.getBoundingClientRect().width < 200).map((e) => e.name),
    ),
    [],
    'Champ de recherche comprime',
  )
  if (largeur < 1024) {
    await dossiers.getByText('Complet', { exact: true }).waitFor()
    await dossiers.getByText('Non attribué', { exact: true }).waitFor()
    const fiche = dossiers.getByRole('listitem').first()
    assert(await fiche.evaluate((e) => e.scrollWidth <= e.clientWidth), 'Fiche dossier tronquee')
    await dossiers.getByRole('link', { name: 'OCRFICTIF', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.waitForURL((u) => u.pathname === `/espace/dossiers/${id}`)
    await visiter('/espace', 'tableau')
  } else {
    await page.getByRole('table').getByText('OCRFICTIF', { exact: true }).waitFor()
  }
  if (moteur.name() === 'chromium' && largeur === 390) {
    await page.locator('.espace-shell').evaluate((e) => {
      e.classList.remove('bg-cream')
      e.classList.add('bg-paper')
    })
    await assert.rejects(verifierSurface(page), /Le fond de marque est absent/)
    await page.locator('.espace-shell').evaluate((e) => {
      e.classList.remove('bg-paper')
      e.classList.add('bg-cream')
    })
    await verifierSurface(page)
    console.log('OK : disparition de la palette detectee par contre-preuve navigateur')
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'smooth'
    })
    await assert.rejects(verifierSurface(page), /Le defilement applicatif doit rester immediat/)
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('scroll-behavior')
    })
    await verifierSurface(page)
    console.log('OK : retour du defilement anime detecte par contre-preuve navigateur')
  }
  await visiter('/espace/collaborateurs', 'collaborateurs')
  await visiter('/espace/connecteurs', 'connecteurs')
  await visiter('/espace/notifications', 'notifications')
  await visiter('/espace/rappels', 'rappels')
  await visiter('/espace/securite', 'applications-secours')
  simulerPanne(true)
  try {
    await visiter('/espace/notifications', 'erreur', false)
    await page.getByRole('button', { name: 'Réessayer', exact: true }).waitFor()
  } finally {
    simulerPanne(false)
  }
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await page.getByRole('heading', { name: 'Mes notifications', exact: true }).waitFor()
  await visiter(`/espace/dossiers/${id}`, 'dossier')
  await parcourirSupport(page, moteur, largeur, 'agence')
  await visiter('/connexion', 'connexion')
  await visiter('/demarrer', 'demarrer')
  await visiter('/lien-invalide', 'lien-invalide')
  // Le lien de saut doit rendre le contenu atteignable au clavier.
  await page.keyboard.press(
    process.platform === 'darwin' && moteur.name() === 'webkit' ? 'Alt+Tab' : 'Tab',
  )
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('href')),
    '#contenu-espace',
  )
  await page.keyboard.press('Enter')
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'contenu-espace')
  for (const partie of ['locataire', 'garant']) {
    const jwt = await new SignJWT({ role: 'porteur_lien', dossier_id: id, role_partie: partie })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(id)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('fixture'))
    await contexte.addCookies([{ name: 'cloison_capacite', value: jwt, url: site, httpOnly: true }])
    await visiter('/' + partie, partie)
    await parcourirSupport(page, moteur, largeur, partie)
    assert.equal(new URL(page.url()).pathname, '/' + partie, 'Le parcours porteur doit etre rendu')
  }
  const encoder = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const segments = session.access_token.split('.')
  const contenu = JSON.parse(Buffer.from(segments[1], 'base64url').toString())
  const corps = segments[0] + '.' + encoder({ ...contenu, aal: 'aal1' })
  const token =
    corps + '.' + createHmac('sha256', 'fixture-sans-valeur').update(corps).digest('base64url')
  await contexte.addCookies([
    {
      name: 'sb-127-auth-token',
      value: 'base64-' + encoder({ ...session, access_token: token }),
      url: site,
      httpOnly: true,
    },
  ])
  await visiter('/connexion/securite', 'securite')
  assert.equal(new URL(page.url()).pathname, '/connexion/securite')
  await visiter('/', 'home-reference', false)
  if (largeur < 768) {
    const menu = page.getByRole('navigation', { name: 'Navigation principale' }).locator('details')
    await menu.locator('summary').focus()
    await page.keyboard.press('Enter')
    assert.equal(await menu.evaluate((e) => e.open), true)
    await menu.getByRole('link', { name: 'Agences', exact: true }).focus()
    await page.keyboard.press('Escape')
    assert.equal(await menu.evaluate((e) => e.open), false)
    assert.equal(await menu.locator('summary').evaluate((e) => document.activeElement === e), true)
    await page.keyboard.press('Enter')
    await menu.getByRole('link', { name: 'Tarifs', exact: true }).click()
    await page.waitForURL((u) => u.hash === '#tarifs')
    await page.waitForFunction(() => {
      const section = document.querySelector('#tarifs').getBoundingClientRect()
      const entete = document.querySelector('header').getBoundingClientRect()
      return section.top >= entete.bottom && section.top < innerHeight
    })
    assert.equal(await menu.evaluate((e) => e.open), false)
    await menu.locator('summary').click()
    await menu.getByRole('link', { name: 'Agences', exact: true }).click()
    await page.waitForURL((u) => u.pathname === '/agences')
  }
  await visiter('/agences', 'agences', false)
  await visiter('/page-inexistante-mobile', 'introuvable', false)
  const pages = (await readdir('app', { recursive: true }))
    .filter((p) => p.endsWith('/page.tsx'))
    .map(
      (p) =>
        '/' +
        p
          .split('/')
          .filter((segment) => !segment.startsWith('(') && segment !== 'page.tsx')
          .join('/'),
    )
  assert.deepEqual(
    pages.filter((p) => !routesVues.has(p)),
    [],
    'Page absente de la revue responsive',
  )
  console.log(
    `OK : interface ${moteur.name()} ${largeur}, quinze pages et page introuvable, palette, clavier et mouvement reduit`,
  )
}
