/**
 * Lecture minimale du DER (X.690), pour ce que `node:crypto` ne rend pas :
 * les points de distribution d'un certificat et les listes de revocation.
 *
 * Lecture stricte : longueurs definies, bornees par le tampon, sans etiquette
 * longue. Tout ecart leve une erreur, que l'appelant traite comme « inconnu ».
 * Module pur.
 */

export type Noeud = {
  etiquette: number
  contenu: Buffer
  /** Etiquette, longueur et contenu : les octets exacts de l'element. */
  brut: Buffer
}

export const SEQUENCE = 0x30
export const ENTIER = 0x02
export const OID = 0x06

/** Lit l'element qui commence a `position`. */
export function lireNoeud(octets: Buffer, position = 0): Noeud {
  const etiquette = octets[position]
  let longueur = octets[position + 1]
  if (etiquette === undefined || longueur === undefined) throw new Error('DER tronque')
  if ((etiquette & 0x1f) === 0x1f) throw new Error('Etiquette longue')
  let debut = position + 2
  if (longueur & 0x80) {
    const taille = longueur & 0x7f
    if (taille < 1 || taille > 4 || debut + taille > octets.length)
      throw new Error('Longueur invalide')
    longueur = octets.readUIntBE(debut, taille)
    debut += taille
  }
  if (debut + longueur > octets.length) throw new Error('DER tronque')
  return {
    etiquette,
    contenu: octets.subarray(debut, debut + longueur),
    brut: octets.subarray(position, debut + longueur),
  }
}

/** Les elements contenus dans un element construit. */
export function enfants(noeud: Noeud): Noeud[] {
  if (!(noeud.etiquette & 0x20)) throw new Error('Element primitif')
  const liste: Noeud[] = []
  let position = 0
  while (position < noeud.contenu.length) {
    const enfant = lireNoeud(noeud.contenu, position)
    liste.push(enfant)
    position += enfant.brut.length
  }
  return liste
}

/** L'element unique qui occupe tout le tampon. */
export function lireTout(octets: Buffer): Noeud {
  const noeud = lireNoeud(octets)
  if (noeud.brut.length !== octets.length) throw new Error('Octets en trop')
  return noeud
}

/** Un entier positif, en hexadecimal sans zeros de tete. */
export function entierHexa(noeud: Noeud): string {
  if (noeud.etiquette !== ENTIER) throw new Error('Entier attendu')
  return noeud.contenu.toString('hex').replace(/^0+(?=.)/, '')
}

/** UTCTime ou GeneralizedTime, en UTC a la seconde. */
export function instant(noeud: Noeud): number {
  const texte = noeud.contenu.toString('latin1')
  let lu: RegExpExecArray | null
  let annee: number
  if (noeud.etiquette === 0x17 && (lu = /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/.exec(texte)))
    annee = Number(lu[1]) + (Number(lu[1]) < 50 ? 2000 : 1900)
  else if (
    noeud.etiquette === 0x18 &&
    (lu = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/.exec(texte))
  )
    annee = Number(lu[1])
  else throw new Error('Date illisible')
  const [mois, jour, heure, minute, seconde] = lu.slice(2).map(Number)
  return Date.UTC(annee, mois! - 1, jour, heure, minute, seconde)
}
