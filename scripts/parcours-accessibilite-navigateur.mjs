import assert from 'node:assert/strict'

import { releverComplements } from './audit-accessibilite-complements.mjs'

/**
 * La commande de pause du site public : au clavier, elle fige le bandeau
 * defilant et la video d'ambiance, puis les relance (WCAG 2.2.2).
 */
export async function parcourirPauseMouvement(page, site, moteur, largeur) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(site + '/')
  const commande = page.locator('button[data-pause-mouvement]')
  await commande.waitFor({ state: 'visible' })
  const etat = () =>
    page.evaluate(() => ({
      bandeau: getComputedStyle(document.querySelector('.animate-marquee')).animationPlayState,
      video: document.querySelector('video').paused,
      appuye: document.querySelector('button[data-pause-mouvement]').getAttribute('aria-pressed'),
    }))
  assert.equal((await etat()).bandeau, 'running', 'Le bandeau doit defiler par defaut')
  assert.equal((await etat()).appuye, 'false')
  await commande.focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.animate-marquee')).animationPlayState ===
        'paused' && document.querySelector('video').paused,
  )
  assert.equal((await etat()).appuye, 'true', 'La commande doit annoncer la pause')
  assert.equal(
    await commande.getAttribute('aria-label'),
    'Mettre les animations en pause',
    'Le nom de la commande ne change pas, son etat si',
  )
  await page.keyboard.press('Enter')
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.animate-marquee')).animationPlayState === 'running',
  )
  assert.equal((await etat()).appuye, 'false')
  // Avec le reglage systeme, rien ne bouge : la commande n'a plus d'objet.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await commande.waitFor({ state: 'hidden' })
  assert.deepEqual(
    (await releverComplements(page)).filter((c) => c.regle === 'mouvement-sans-pause'),
    [],
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await commande.waitFor({ state: 'visible' })
  console.log(
    `OK : pause du mouvement ${moteur.name()} ${largeur}, bandeau et video figes au clavier`,
  )
}

/**
 * Contre-preuve des controles complementaires : chaque regle doit refuser un
 * defaut connu, pose sur une page servie, puis la page doit repasser.
 */
export async function verifierDetectionComplements(page, site) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(site + '/')
  await page.locator('button[data-pause-mouvement]').waitFor({ state: 'visible' })
  const regles = async () =>
    new Set((await releverComplements(page, { clavier: true })).map((c) => c.regle))
  assert.deepEqual([...(await regles())], [], 'La page de reference doit passer')
  await page.evaluate(() => {
    document.documentElement.dataset.langueInitiale = document.documentElement.lang
    document.documentElement.lang = 'en'
    document.querySelector('button[data-pause-mouvement]').removeAttribute('data-pause-mouvement')
    const essai = document.createElement('div')
    essai.id = 'essai-complements'
    essai.innerHTML = `
      <h6>Titre qui saute des niveaux</h6>
      <button type="button" style="width:12px;height:12px;min-height:0;padding:0;border:0;outline:none">x</button>
      <input type="email" name="courriel-essai" aria-label="Courriel" style="outline:none">
      <a href="https://exemple.invalid/" target="_blank" rel="noreferrer" style="display:inline-block;min-height:44px">Ailleurs</a>
      <svg width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>
      <p style="height:1.2em;overflow:hidden;width:8rem">Un texte qui ne tient plus quand on ecarte les lignes et les mots.</p>
      <main>Seconde region principale</main>`
    // En fin de contenu : le titre d'essai suit alors un vrai titre.
    document.querySelector('main').append(essai)
  })
  try {
    const vues = await regles()
    for (const attendue of [
      'langue-page',
      'ordre-titres',
      'taille-cible',
      'saisie-automatique',
      'nouvel-onglet',
      'mouvement-sans-pause',
      'dessin-sans-nom',
      'region-principale',
      'espacement-texte',
      'focus-visible',
    ])
      assert(vues.has(attendue), `Defaut non detecte : ${attendue} (vus : ${[...vues].join(', ')})`)
  } finally {
    await page.evaluate(() => {
      document.getElementById('essai-complements')?.remove()
      document.documentElement.lang = document.documentElement.dataset.langueInitiale
      delete document.documentElement.dataset.langueInitiale
      document.querySelector('.commande-mouvement').setAttribute('data-pause-mouvement', '')
    })
  }
  assert.deepEqual([...(await regles())], [], 'La page doit repasser apres la contre-preuve')
  console.log(
    'OK : controles complementaires, langue, titres, cibles, saisie, onglet, mouvement, focus et espacement refuses',
  )
}
