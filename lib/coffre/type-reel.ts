/**
 * Ce que les octets sont vraiment.
 *
 * Une extension de fichier est une affirmation du client, et le client est
 * ici une personne qu'on n'a jamais vue. Un `bulletin.pdf` peut etre
 * n'importe quoi ; ce module ne lit que le debut du contenu.
 *
 * Il refuse plus qu'il n'accepte, et c'est voulu : trois formats suffisent a
 * tout ce qu'un garant depose, et chaque format supplementaire serait un
 * decodeur de plus a faire tourner sur un fichier hostile.
 *
 * Deux categories de refus, qui ne se traitent pas pareil. Un format qu'on
 * reconnait sans l'accepter merite qu'on le nomme : quelqu'un qui envoie une
 * photo depuis un iPhone recent doit apprendre ce qu'est le HEIC, pas lire
 * « fichier invalide ». Un contenu qu'on ne reconnait pas du tout n'a droit
 * qu'a une phrase generique, puisqu'on n'a rien a en dire.
 *
 * Ce module ne connait ni Supabase ni l'environnement : il prend des octets
 * et rend un verdict. Il est donc entierement testable.
 */

/** Un octet nul est un fichier vide, et il n'y a rien a en faire. */
export const TAILLE_MINIMALE = 1

/** Vingt megaoctets, la meme borne que celle de la table `pieces`. */
export const TAILLE_MAXIMALE = 20 * 1024 * 1024

/** Les trois seuls types que le coffre accepte. */
export type TypeAccepte = 'application/pdf' | 'image/jpeg' | 'image/png'

export type Verdict = { accepte: true; type: TypeAccepte } | { accepte: false; raison: string }

/** Une signature en tete de fichier, et ce qu'elle designe. */
type Empreinte = { readonly octets: readonly number[]; readonly type: TypeAccepte }

const ACCEPTES: readonly Empreinte[] = [
  // `%PDF-`
  { octets: [0x25, 0x50, 0x44, 0x46, 0x2d], type: 'application/pdf' },
  { octets: [0xff, 0xd8, 0xff], type: 'image/jpeg' },
  { octets: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], type: 'image/png' },
]

/** Reconnus, refuses, et nommes pour que la personne sache quoi faire. */
const NOMMES: readonly { readonly octets: readonly number[]; readonly raison: string }[] = [
  {
    // `PK\x03\x04` : tous les formats bureautiques modernes sont des archives.
    octets: [0x50, 0x4b, 0x03, 0x04],
    raison:
      'Ce fichier est un document bureautique (Word, Excel, OpenDocument). ' +
      'Exporte-le en PDF avant de le deposer.',
  },
  {
    // L'ancien format Office, avant 2007.
    octets: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    raison:
      'Ce fichier est un ancien document Office. Ouvre-le et enregistre-le en PDF ' +
      'avant de le deposer.',
  },
  {
    // `{\rtf`
    octets: [0x7b, 0x5c, 0x72, 0x74, 0x66],
    raison: 'Ce fichier est un document RTF. Exporte-le en PDF avant de le deposer.',
  },
  {
    octets: [0x47, 0x49, 0x46, 0x38],
    raison: 'Ce fichier est une image GIF. Depose plutot une photo JPEG ou PNG, ou un PDF.',
  },
]

/**
 * Les formats ranges dans une boite ISO, reconnaissables a `ftyp`.
 *
 * Le HEIC merite ce traitement a lui seul : c'est le format par defaut des
 * iPhone depuis des annees, donc le refus le plus frequent qu'on rencontrera,
 * et celui ou une explication change tout.
 */
const MARQUES_ISO: readonly { readonly prefixes: readonly string[]; readonly raison: string }[] = [
  {
    prefixes: ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'],
    raison:
      'Cette photo est au format HEIC, celui des iPhone recents. ' +
      'Dans Reglages, Appareil photo, Formats, choisis « Plus compatible », ' +
      'ou envoie-la en PDF.',
  },
  {
    prefixes: ['avif', 'avis'],
    raison: 'Cette photo est au format AVIF. Enregistre-la en JPEG ou en PNG avant de la deposer.',
  },
  {
    prefixes: ['isom', 'mp41', 'mp42', 'qt  ', 'M4V ', '3gp'],
    raison: 'Ce fichier est une video. Le coffre attend des documents : un PDF ou une photo.',
  },
]

function commencePar(contenu: Buffer, octets: readonly number[]): boolean {
  if (contenu.length < octets.length) return false
  return octets.every((octet, index) => contenu.readUInt8(index) === octet)
}

/**
 * La marque d'une boite ISO, si c'en est une.
 *
 * Les quatre premiers octets sont une taille, `ftyp` suit, puis la marque.
 * On ne regarde donc pas le debut du fichier mais l'octet 4.
 */
function marqueIso(contenu: Buffer): string | null {
  if (contenu.length < 12) return null
  if (contenu.subarray(4, 8).toString('latin1') !== 'ftyp') return null
  return contenu.subarray(8, 12).toString('latin1')
}

/**
 * Le type reel d'un contenu, ou la raison de le refuser.
 *
 * L'ordre compte : on cherche d'abord ce qu'on accepte, ensuite ce qu'on sait
 * nommer, et le refus generique n'arrive qu'en dernier.
 */
export function typeReel(contenu: Buffer): Verdict {
  for (const empreinte of ACCEPTES) {
    if (commencePar(contenu, empreinte.octets)) return { accepte: true, type: empreinte.type }
  }

  for (const connu of NOMMES) {
    if (commencePar(contenu, connu.octets)) return { accepte: false, raison: connu.raison }
  }

  const marque = marqueIso(contenu)
  if (marque) {
    for (const iso of MARQUES_ISO) {
      if (iso.prefixes.some((prefixe) => marque.startsWith(prefixe))) {
        return { accepte: false, raison: iso.raison }
      }
    }
  }

  return {
    accepte: false,
    raison:
      'Ce fichier n’est ni un PDF ni une photo JPEG ou PNG. ' +
      'Ce sont les seuls formats que le coffre accepte.',
  }
}

/**
 * La taille et le type, dans cet ordre.
 *
 * La taille d'abord parce qu'elle est la moins chere a verifier et qu'elle
 * evite de promener vingt megaoctets de trop dans le reste du chemin.
 */
export function verifierContenu(contenu: Buffer): Verdict {
  if (contenu.length < TAILLE_MINIMALE) {
    return { accepte: false, raison: 'Ce fichier est vide.' }
  }

  if (contenu.length > TAILLE_MAXIMALE) {
    const megaoctets = Math.round(TAILLE_MAXIMALE / (1024 * 1024))
    return {
      accepte: false,
      raison: `Ce fichier depasse ${megaoctets} Mo. Reduis sa taille ou depose-le en plusieurs fois.`,
    }
  }

  return typeReel(contenu)
}
