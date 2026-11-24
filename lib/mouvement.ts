/**
 * L'etat « animations en pause » du site public, partage entre la commande
 * de pause, le bandeau defilant et la video d'ambiance.
 *
 * Il vit sur `<html data-mouvement>` : le CSS s'en sert directement pour
 * figer le bandeau, et un composant s'y abonne sans passer par un contexte
 * (la video et la commande ne sont pas dans la meme branche de la page). Il
 * n'est pas conserve d'une visite a l'autre : rien n'est ecrit sur l'appareil.
 */
const EVENEMENT = 'cloison:mouvement'

export function mouvementEnPause(): boolean {
  return document.documentElement.dataset.mouvement === 'pause'
}

export function reglerMouvement(enPause: boolean): void {
  if (enPause) document.documentElement.dataset.mouvement = 'pause'
  else delete document.documentElement.dataset.mouvement
  window.dispatchEvent(new Event(EVENEMENT))
}

export function suivreMouvement(rappel: () => void): () => void {
  window.addEventListener(EVENEMENT, rappel)
  return () => window.removeEventListener(EVENEMENT, rappel)
}
