import 'server-only'
import { cleMaitresse } from './cle-maitresse'
import { ouvrirAvecTrousseau, scellerAvecTrousseau } from './rotation-format'
function decoder(valeur: unknown): Buffer {
  if (typeof valeur !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(valeur))
    throw new Error('Configuration des cles invalide')
  const cle = Buffer.from(valeur, 'base64')
  if (cle.length !== 32 || cle.toString('base64') !== valeur)
    throw new Error('Configuration des cles invalide')
  return cle
}
function trousseau() {
  const historique = cleMaitresse()
  const activeBrute = process.env.CLE_MAITRESSE_ACTIVE?.trim()
  const active = activeBrute ? decoder(activeBrute) : null
  const lectureBrute = process.env.CLES_MAITRESSES_LECTURE?.trim()
  let lecture: Buffer[] = []
  if (lectureBrute) {
    try {
      if (lectureBrute.length > 512) throw new Error()
      const valeurs: unknown = JSON.parse(lectureBrute)
      if (!Array.isArray(valeurs) || valeurs.length > 4) throw new Error()
      lecture = valeurs.map(decoder)
    } catch {
      throw new Error('Configuration des cles invalide')
    }
  }
  return { historique, active, lecture }
}
export function scellerMaitresse(contenu: Buffer): Buffer {
  return scellerAvecTrousseau(contenu, trousseau())
}
export function ouvrirMaitresse(chiffre: Buffer): Buffer {
  return ouvrirAvecTrousseau(chiffre, trousseau())
}
/** Rechiffre la meme DEK, sans modifier les documents. */
export function rescellerMaitresse(chiffre: Buffer): Buffer {
  const cles = trousseau()
  return scellerAvecTrousseau(ouvrirAvecTrousseau(chiffre, cles), cles)
}
