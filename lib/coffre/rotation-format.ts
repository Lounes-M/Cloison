import { createHash } from 'node:crypto'
import { ouvrir, sceller } from './enveloppe.ts'
export type Trousseau = { historique: Buffer; active: Buffer | null; lecture: Buffer[] }
// Les enveloppes historiques n'ont pas d'en-tete. La nouvelle forme identifie
// la cle sans l'exposer ; toute mauvaise cle reste refusee par AES-GCM.
const MARQUE = Buffer.from('cloison.enveloppe.v2\0', 'ascii')
const TAILLE_ID = 16
const identifiant = (cle: Buffer) =>
  createHash('sha256').update(cle).digest().subarray(0, TAILLE_ID)
export function scellerAvecTrousseau(contenu: Buffer, trousseau: Trousseau): Buffer {
  const { historique, active } = trousseau
  if (!active) return sceller(contenu, historique)
  return Buffer.concat([MARQUE, identifiant(active), sceller(contenu, active)])
}
export function ouvrirAvecTrousseau(chiffre: Buffer, trousseau: Trousseau): Buffer {
  const { historique, active, lecture } = trousseau
  if (!chiffre.subarray(0, MARQUE.length).equals(MARQUE)) return ouvrir(chiffre, historique)
  const debut = MARQUE.length + TAILLE_ID
  if (chiffre.length < debut + 28) throw new Error('Enveloppe de cle invalide')
  const id = chiffre.subarray(MARQUE.length, debut)
  const cle = [...(active ? [active] : []), ...lecture, historique].find((candidate) =>
    identifiant(candidate).equals(id),
  )
  if (!cle) throw new Error('Cle de lecture indisponible')
  return ouvrir(chiffre.subarray(debut), cle)
}
