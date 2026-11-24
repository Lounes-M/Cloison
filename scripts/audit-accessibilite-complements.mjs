/**
 * Ce qu'axe-core ne sait pas dire, verifie sur la page rendue.
 *
 * axe controle une image fixe du DOM. Il ne voit ni la langue annoncee par
 * `<html>` quand le contenu en porte une autre, ni un bandeau qui defile sans
 * commande de pause, ni l'ordre de tabulation, ni un texte coupe quand la
 * personne ecarte les lignes. Chaque regle ci-dessous correspond a un critere
 * WCAG 2.2 de niveau A ou AA, repris par le RGAA, et rend une liste de
 * constats : vide, la page passe.
 */

/** Espacements que la page doit supporter sans perte (WCAG 1.4.12). */
const ESPACEMENT_TEXTE = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`

/** Constats lisibles dans le DOM, sans interaction. Execute dans la page. */
function releverDansLaPage() {
  const constats = []
  const visible = (e) => {
    if (!e.getClientRects().length) return false
    const style = getComputedStyle(e)
    return style.visibility !== 'hidden' && style.display !== 'none'
  }
  const nom = (e) =>
    (e.getAttribute('aria-label') || e.textContent || e.getAttribute('name') || e.id || e.tagName)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 48)
  const noter = (regle, element, detail = '') =>
    constats.push({ regle, cible: `${element.tagName.toLowerCase()} ${nom(element)}`, detail })

  // 3.1.1 Langue de la page. `<html>` doit annoncer la langue du contenu
  // principal : le titre du document, lu en premier, n'herite que de lui.
  const principal = document.querySelector('main') ?? document.querySelector('h1')
  const langueContenu = principal?.closest('[lang]')?.getAttribute('lang') ?? ''
  const langueDocument = document.documentElement.getAttribute('lang') ?? ''
  if (!langueDocument || langueContenu.slice(0, 2) !== langueDocument.slice(0, 2))
    constats.push({
      regle: 'langue-page',
      cible: 'html',
      detail: `html=${langueDocument || 'absente'} contenu=${langueContenu || 'absente'}`,
    })

  // 1.3.1 et 2.4.6 Titres : aucun niveau saute.
  let precedent = 0
  for (const titre of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (!visible(titre)) continue
    const niveau = Number(titre.tagName[1])
    if (precedent && niveau > precedent + 1)
      noter('ordre-titres', titre, `h${precedent} puis h${niveau}`)
    precedent = niveau
  }

  // 2.5.8 Taille de cible : 24 px CSS au moins. Un lien dans une phrase est
  // exempte par le critere ; une case masquee est jugee sur son etiquette.
  const commandes =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"]'
  for (const element of document.querySelectorAll(commandes)) {
    if (!visible(element) || element.disabled) continue
    // Le champ leurre des formulaires publics est cache a tous : ce n'est
    // pas une commande.
    if (element.closest('[aria-hidden="true"]')) continue
    let cible = element
    const boite = element.getBoundingClientRect()
    if (element.matches('input, select, textarea') && (boite.width < 24 || boite.height < 24)) {
      const etiquette = element.labels?.[0]
      if (etiquette && visible(etiquette)) cible = etiquette
    }
    const mesure = cible.getBoundingClientRect()
    if (mesure.width >= 24 && mesure.height >= 24) continue
    const parent = element.parentElement
    const dansUnePhrase =
      element.tagName === 'A' &&
      getComputedStyle(element).display.startsWith('inline') &&
      parent &&
      parent.textContent.trim().length > element.textContent.trim().length
    if (dansUnePhrase) continue
    // La zone de toucher peut deborder du dessin (pseudo-element) : on sonde
    // a 12 px du centre dans les quatre directions avant de conclure.
    cible.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    const centre = cible.getBoundingClientRect()
    const x = centre.left + centre.width / 2
    const y = centre.top + centre.height / 2
    const touche = [
      [x - 11.5, y],
      [x + 11.5, y],
      [x, y - 11.5],
      [x, y + 11.5],
    ].every(([px, py]) => {
      const dessus = document.elementFromPoint(px, py)
      return Boolean(dessus) && cible.contains(dessus)
    })
    if (touche) continue
    noter('taille-cible', element, `${Math.round(mesure.width)} x ${Math.round(mesure.height)} px`)
  }

  // 1.3.5 Finalite de la saisie : un champ qui porte une donnee de la
  // personne declare `autocomplete`, y compris pour le refuser.
  for (const champ of document.querySelectorAll('input, textarea')) {
    if (!visible(champ)) continue
    const type = champ.getAttribute('type') ?? 'text'
    const cle = `${champ.getAttribute('name') ?? ''} ${champ.id}`.toLowerCase()
    const personnel =
      ['email', 'tel'].includes(type) ||
      /courriel|e-?mail|prenom|first|last|telephone|phone|adresse|address|postal/.test(cle)
    if (!personnel || ['hidden', 'checkbox', 'radio', 'file', 'search'].includes(type)) continue
    if (!champ.getAttribute('autocomplete') && !champ.closest('form[autocomplete]'))
      noter('saisie-automatique', champ, `type=${type} name=${champ.getAttribute('name')}`)
  }

  // 3.2.5 et bonne pratique RGAA 13.2 : une ouverture dans un nouvel onglet
  // se dit dans le nom du lien.
  for (const lien of document.querySelectorAll('a[target="_blank"]')) {
    if (!visible(lien)) continue
    if (!/nouvel onglet|nouvelle fenêtre|new tab|new window/i.test(nom(lien) + lien.title))
      noter('nouvel-onglet', lien)
  }

  // 2.2.2 Mettre en pause, arreter, masquer : ce qui bouge seul plus de cinq
  // secondes a cote d'autre chose doit pouvoir etre arrete depuis la page.
  const enMouvement = []
  for (const video of document.querySelectorAll('video')) {
    if (!visible(video) || video.controls) continue
    if (video.loop && (video.autoplay || !video.paused)) enMouvement.push(video)
  }
  for (const animation of document.getAnimations()) {
    const effet = animation.effect
    const duree = effet?.getComputedTiming().endTime
    const element = effet?.target
    if (!element || animation.playState !== 'running' || !visible(element)) continue
    if (duree !== Infinity && !(duree > 5000)) continue
    // Un point d'etat ou un indicateur de chargement n'est pas un contenu :
    // on ne retient que ce qui deplace une surface lisible.
    const boite = element.getBoundingClientRect()
    if (boite.width < 120 || !element.textContent.trim()) continue
    enMouvement.push(element)
  }
  if (enMouvement.length && !document.querySelector('button[data-pause-mouvement]'))
    for (const element of enMouvement) noter('mouvement-sans-pause', element)

  // 1.1.1 Un dessin vectoriel expose aux lecteurs d'ecran porte un nom.
  for (const dessin of document.querySelectorAll('svg')) {
    if (!visible(dessin) || dessin.closest('[aria-hidden="true"]')) continue
    const nomme =
      dessin.getAttribute('aria-label') ||
      dessin.getAttribute('aria-labelledby') ||
      dessin.querySelector('title') ||
      dessin.getAttribute('role') === 'presentation'
    if (!nomme) noter('dessin-sans-nom', dessin.parentElement ?? dessin)
  }

  // 1.3.1 Une seule region principale.
  const principales = [...document.querySelectorAll('main, [role="main"]')].filter(visible)
  if (principales.length !== 1)
    constats.push({ regle: 'region-principale', cible: 'main', detail: `${principales.length}` })

  return constats
}

/** Texte coupe par son conteneur. Execute dans la page, espacements poses. */
function releverTexteCoupe() {
  const coupes = []
  for (const element of document.querySelectorAll('body *')) {
    if (!element.getClientRects().length) continue
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.position === 'absolute') continue
    const coupeVertical =
      ['hidden', 'clip'].includes(style.overflowY) &&
      element.scrollHeight > element.clientHeight + 2
    const coupeHorizontal =
      ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 2
    if (!coupeVertical && !coupeHorizontal) continue
    // Seul un element qui porte lui-meme du texte perd de l'information. Un
    // bandeau defilant ou un decor en biais debordent par construction.
    const porteDuTexte = [...element.childNodes].some(
      (noeud) => noeud.nodeType === Node.TEXT_NODE && noeud.textContent.trim(),
    )
    if (!porteDuTexte || element.closest('[aria-hidden="true"], [data-defilement]')) continue
    coupes.push({
      regle: 'espacement-texte',
      cible: `${element.tagName.toLowerCase()} ${element.textContent.trim().slice(0, 48)}`,
      detail: `${element.scrollWidth}x${element.scrollHeight} dans ${element.clientWidth}x${element.clientHeight}`,
    })
  }
  if (document.documentElement.scrollWidth > innerWidth + 1)
    coupes.push({
      regle: 'espacement-texte',
      cible: 'page',
      detail: `largeur ${document.documentElement.scrollWidth} pour ${innerWidth}`,
    })
  return coupes
}

/** Etat du focus apres une tabulation. Execute dans la page. */
function releverFocus() {
  const element = document.activeElement
  if (!element || element === document.body || element === document.documentElement) return null
  const dejaVu = window.__cloisonArretsVus.has(element)
  window.__cloisonArretsVus.add(element)
  const boite = element.getBoundingClientRect()
  const cle = [
    element.tagName.toLowerCase(),
    (
      element.getAttribute('aria-label') ||
      element.textContent ||
      element.getAttribute('name') ||
      ''
    )
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 48),
    element.getAttribute('href') ?? element.id,
  ].join(' ')
  // L'indicateur peut etre porte par l'element ou par l'etiquette qu'il
  // commande (cases et choix masques, dessines par leur etiquette).
  const marque = (s) => s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) >= 2
  const porteurs = [element, ...(element.labels ?? [])]
  if (element.nextElementSibling?.tagName === 'LABEL') porteurs.push(element.nextElementSibling)
  const indique = porteurs.some((e) => marque(getComputedStyle(e)))
  // 2.4.11 Focus non masque : le centre de l'element ne doit pas etre sous un
  // bandeau fixe. Une case masquee est jugee sur son etiquette.
  const cible = boite.width < 4 && element.labels?.[0] ? element.labels[0] : element
  const zone = cible.getBoundingClientRect()
  const x = Math.min(Math.max(zone.left + zone.width / 2, 0), innerWidth - 1)
  const y = zone.top + zone.height / 2
  let masque = null
  if (y >= 0 && y < innerHeight) {
    const dessus = document.elementFromPoint(x, y)
    if (dessus && !cible.contains(dessus) && !dessus.contains(cible)) {
      let ancetre = dessus
      while (ancetre && ancetre !== document.body) {
        if (['fixed', 'sticky'].includes(getComputedStyle(ancetre).position)) {
          masque = ancetre.tagName.toLowerCase() + '.' + String(ancetre.className).slice(0, 32)
          break
        }
        ancetre = ancetre.parentElement
      }
    }
  }
  return { cle, dejaVu, indique, masque, horsEcran: y < 0 || y >= innerHeight }
}

/**
 * Parcourt la page a la touche Tab : chaque arret doit montrer un indicateur
 * de focus (WCAG 2.4.7) et rester visible sous les bandeaux fixes (2.4.11).
 */
async function releverTabulation(page) {
  const constats = []
  // Le defilement anime du site public deplacerait la page pendant la mesure.
  const immediat = await page.addStyleTag({
    content: 'html { scroll-behavior: auto !important; }',
  })
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.activeElement?.blur?.()
  })
  // Le tour est fait quand la tabulation revient sur un element deja vu.
  // On reconnait l'element lui-meme, pas son nom : dix liens peuvent
  // s'appeler pareil.
  await page.evaluate(() => {
    window.__cloisonArretsVus = new WeakSet()
  })
  let vides = 0
  for (let pas = 0; pas < 600; pas++) {
    await page.keyboard.press('Tab')
    let arret = await page.evaluate(releverFocus)
    // Sortie du document (barre du navigateur) : le tour reprend en tete.
    if (!arret) {
      if (++vides > 2) break
      continue
    }
    if (arret.dejaVu) break
    // Le navigateur amene l'element dans l'ecran ; une apparition en cours
    // peut le deplacer encore d'une image a l'autre. On ne conclut qu'apres.
    if (arret.horsEcran || arret.masque) {
      await page.waitForTimeout(250)
      arret = await page.evaluate(releverFocus)
    }
    if (!arret.indique) constats.push({ regle: 'focus-visible', cible: arret.cle, detail: '' })
    if (arret.masque)
      constats.push({ regle: 'focus-masque', cible: arret.cle, detail: arret.masque })
    if (arret.horsEcran) constats.push({ regle: 'focus-hors-ecran', cible: arret.cle, detail: '' })
  }
  // La page est rendue comme on l'a trouvee : focus nulle part, et point de
  // depart de la tabulation revenu en tete de document. Un simple `blur`
  // laisserait la prochaine touche Tab repartir du dernier arret.
  await page.evaluate(() => {
    const tete = document.createElement('span')
    tete.tabIndex = -1
    document.body.prepend(tete)
    tete.focus()
    tete.remove()
    window.scrollTo(0, 0)
  })
  await immediat.evaluate((e) => e.remove())
  return constats
}

/**
 * Tous les constats complementaires d'une page. `clavier` ajoute le parcours a
 * la touche Tab, plus long, et l'essai d'espacement du texte.
 */
export async function releverComplements(page, { clavier = false } = {}) {
  const constats = await page.evaluate(releverDansLaPage)
  if (!clavier) return constats
  const style = await page.addStyleTag({ content: ESPACEMENT_TEXTE })
  try {
    constats.push(...(await page.evaluate(releverTexteCoupe)))
  } finally {
    await style.evaluate((e) => e.remove())
  }
  constats.push(...(await releverTabulation(page)))
  return constats
}
