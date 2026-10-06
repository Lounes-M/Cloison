import { CHAMP_SIGNATURE } from './position'
export function bornerPlacement(x: number, y: number, largeur: number, hauteur: number) {
  if (
    ![x, y, largeur, hauteur].every(Number.isFinite) ||
    largeur < CHAMP_SIGNATURE.largeur ||
    hauteur < CHAMP_SIGNATURE.hauteur
  )
    throw new Error('Placement invalide')
  return {
    x: Math.max(0, Math.min(Math.floor(largeur - CHAMP_SIGNATURE.largeur), Math.round(x))),
    y: Math.max(0, Math.min(Math.floor(hauteur - CHAMP_SIGNATURE.hauteur), Math.round(y))),
  }
}
