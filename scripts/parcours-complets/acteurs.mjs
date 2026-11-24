import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SITE, SUPABASE } from './environnement.mjs'
import { codeTotp, courrielAuth, jusqua, lienDans } from './outils.mjs'

/**
 * Un acteur est une personne devant son propre navigateur : contexte isole,
 * largeur d'ecran et langue a elle. Chaque page qu'il ouvre est surveillee :
 * erreur de script, reponse 5xx, debordement horizontal.
 */
export class Acteur {
  constructor(navigateur, { nom, langue, mobile, ip, captures, constats }) {
    Object.assign(this, { navigateur, nom, langue, mobile, ip, captures, constats })
  }

  async ouvrir() {
    this.contexte = await this.navigateur.newContext({
      // Seul le certificat ephemere du harnais est tolere.
      ignoreHTTPSErrors: true,
      viewport: this.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      isMobile: this.mobile,
      hasTouch: this.mobile,
      locale: this.langue === 'en' ? 'en-GB' : 'fr-FR',
      timezoneId: 'Europe/Paris',
      reducedMotion: 'reduce',
      extraHTTPHeaders: { 'x-parcours-ip': this.ip },
    })
    this.contexte.setDefaultTimeout(15_000)
    // Un parcours local ne joint personne d'autre que le site.
    await this.contexte.route(
      (url) => url.origin !== SITE,
      (route) => {
        this.constats.push(`${this.nom} : requete hors du site vers ${route.request().url()}`)
        return route.abort()
      },
    )
    this.page = await this.contexte.newPage()
    this.page.on('pageerror', (e) =>
      this.constats.push(`${this.nom} : erreur de page ${e.message}`),
    )
    this.page.on('console', (m) => {
      if (m.type() === 'error') this.constats.push(`${this.nom} : console ${m.text()}`)
    })
    this.page.on('response', (r) => {
      if (r.status() >= 500) this.constats.push(`${this.nom} : ${r.status()} sur ${r.url()}`)
    })
    return this
  }

  async aller(chemin) {
    await this.page.goto(chemin.startsWith('http') ? chemin : `${SITE}${chemin}`)
    return this.page
  }

  /** Le texte visible de la page, pour les messages d'echec. */
  async texte() {
    return this.page.locator('body').innerText()
  }

  /**
   * Une capture, et les controles qui valent pour toute page : pas de
   * debordement horizontal, et en anglais aucun mot manifestement francais.
   */
  async controler(etape, { francaisAdmis = [] } = {}) {
    const page = this.page
    await page.waitForLoadState('networkidle').catch(() => {})
    const deborde = await page.evaluate(() => {
      const largeur = document.documentElement.clientWidth
      const fautifs = []
      for (const e of document.querySelectorAll('body *')) {
        const r = e.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const style = getComputedStyle(e)
        if (style.position === 'fixed' || e.closest('.sr-only')) continue
        // Un conteneur qui defile chez lui ne fait pas deborder la page.
        let parent = e.parentElement
        let contenu = false
        while (parent && parent !== document.body) {
          const s = getComputedStyle(parent)
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) contenu = true
          parent = parent.parentElement
        }
        if (!contenu && r.right > largeur + 1) {
          fautifs.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 60)}`)
        }
      }
      return {
        page: document.documentElement.scrollWidth > largeur + 1,
        fautifs: fautifs.slice(0, 3),
      }
    })
    if (deborde.page) {
      this.constats.push(
        `${this.nom} : ${etape} deborde horizontalement (${deborde.fautifs.join(', ')})`,
      )
    }
    if (this.langue === 'en') {
      let texte = await page.locator('body').innerText()
      for (const admis of francaisAdmis) texte = texte.replaceAll(admis, ' ')
      const restes = texte.match(FRANCAIS) ?? []
      if (restes.length > 0) {
        const uniques = [...new Set(restes.map((r) => r.trim().toLowerCase()))].slice(0, 8)
        this.constats.push(`${this.nom} : ${etape} garde du francais (${uniques.join(', ')})`)
      }
    }
    if (this.captures) {
      mkdirSync(this.captures, { recursive: true })
      await page.screenshot({
        path: join(
          this.captures,
          `${etape}-${this.langue}-${this.mobile ? 'mobile' : 'ordinateur'}.png`,
        ),
        fullPage: true,
      })
    }
  }

  async fermer() {
    await this.contexte?.close()
  }
}

// Des mots qui n'existent pas en anglais et que toute page francaise emploie.
const FRANCAIS =
  /(?<![\p{L}@.-])(votre|vos|pièces?|déposer|déposée?s?|loyer|enregistrer|télécharger|après|aucune?|envoyer|garant désigné|colocataires?|référence|engagement solidaire|était|être|sélectionn\p{L}*|voir le|responsable|échéance)(?![\p{L}@.-])/giu

/**
 * La connexion d'un collaborateur d'agence, par le vrai chemin : formulaire,
 * courriel d'Auth dans la boite locale, lien, puis second facteur TOTP.
 */
export async function connecterAgence(acteur, adresse, secrets) {
  const page = acteur.page
  const debut = Date.now()
  await acteur.aller(acteur.langue === 'en' ? '/en/connexion' : '/connexion')
  await acteur.controler('agence-connexion')
  await page.fill('input[name=courriel]', adresse)
  await page.keyboard.press('Enter')
  await page.locator('input[name=courriel]').waitFor({ state: 'detached' })
  const courriel = await courrielAuth(adresse, debut - 2000)
  assert.equal(
    courriel.Subject,
    acteur.langue === 'en' ? 'Your Cloison sign-in link' : 'Votre lien de connexion Cloison',
    'Le courriel de connexion suit la langue de la page',
  )
  // Auth redirige vers le site avec un code a usage unique. Le harnais suit
  // ce saut lui-meme : le navigateur refuse le HTTP simple de l'API locale
  // une fois le site vu en HTTPS strict sur le meme hote.
  const saut = await fetch(lienDans(courriel.HTML, `${SUPABASE.api}/auth/v1/verify`), {
    redirect: 'manual',
  })
  const retour = saut.headers.get('location')
  assert(retour?.startsWith(`${SITE}/connexion/verifie?code=`), `Retour inattendu : ${retour}`)
  await page.goto(retour)
  await page.waitForURL('**/connexion/securite')
  if (await page.locator('button[value=configurer]').count()) {
    await page.click('button[value=configurer]')
    await page.locator('#code').waitFor()
    await page.locator('details.aide-espace summary').last().click()
    secrets.set(adresse, (await page.locator('details.aide-espace code').innerText()).trim())
    await acteur.controler('agence-second-facteur')
  }
  const secret = secrets.get(adresse)
  assert(secret, `Aucun secret TOTP connu pour ${adresse}`)
  await page.fill('#code', codeTotp(secret))
  await page.click('button[value=verifier]')
  await page.waitForURL('**/espace')
}

/** Le dernier courriel applicatif (faux Resend) recu par une adresse. */
export async function courrielApplicatif(faux, adresse, filtre = () => true, delai = 15_000) {
  return jusqua(
    () => faux.courriels.findLast((c) => c.to.includes(adresse) && filtre(c)) ?? null,
    `courriel applicatif pour ${adresse}`,
    delai,
  ).catch((erreur) => {
    const recus = faux.courriels.filter((c) => c.to.includes(adresse)).map((c) => c.subject)
    throw new Error(`${erreur.message} (recus : ${recus.join(' | ') || 'aucun'})`)
  })
}

export function lienPorteur(courriel) {
  return lienDans(courriel.text, `${SITE}/lien/`)
}
