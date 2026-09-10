import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SignJWT } from 'jose'
import { createHmac } from 'node:crypto'

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
      }
    })
  assert.equal(couleurs.fond, couleurs.attendu, 'Le fond de marque est absent')
}

/** Rendus et acces clavier sur les pages reelles, donnees du faux fournisseur local. */
export async function parcourirInterface(page, site, id, moteur, largeur, session) {
  const contexte = page.context()
  const repertoire = process.env.CLOISON_CAPTURE_INTERFACE_DIR
  if (repertoire) await mkdir(repertoire, { recursive: true })
  const visiter = async (chemin, nom, shell = true) => {
    await page.goto(site + chemin)
    await page.locator('h1').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.locator('h1').count(), 1, 'Titre de page unique')
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Debordement interface ${nom}`,
    )
    if (shell) await verifierSurface(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const entete = page.locator('.entete-espace')
    if (await entete.count())
      assert.equal(await entete.evaluate((e) => getComputedStyle(e).animationName), 'none')
    if (repertoire && moteur.name() === 'chromium')
      await page.screenshot({ path: join(repertoire, `${nom}-${largeur}.png`), fullPage: true })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  }
  await visiter('/espace', 'tableau')
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
  }
  await visiter('/espace/collaborateurs', 'collaborateurs')
  await visiter('/espace/connecteurs', 'connecteurs')
  await visiter(`/espace/dossiers/${id}`, 'dossier')
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
  console.log(
    `OK : interface ${moteur.name()} ${largeur}, dix pages, palette, clavier et mouvement reduit`,
  )
}
