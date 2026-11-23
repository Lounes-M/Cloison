/**
 * Lecture du format 2D-Doc (ANTS), sans aucune verification de signature.
 *
 * Un 2D-Doc est une chaine courte : un en-tete de taille fixe, des champs,
 * le separateur US (0x1F), puis la signature en Base32. Ce qui est signe est
 * tout ce qui precede le separateur, octet pour octet. La verification ne
 * depend donc pas de la lecture des champs : une table de champs incomplete
 * peut priver l'agence d'une valeur, jamais valider un code qui ne l'est pas.
 *
 * Module pur : ni reseau, ni horloge, ni decodeur d'image.
 */

import type { ValeursAvis } from './resultat.ts'

const GS = 0x1d
const US = 0x1f

/** Tailles d'en-tete des versions encodees en texte (C40). */
const ENTETES: Readonly<Record<string, number>> = { '01': 22, '02': 22, '03': 24, '04': 26 }

/** Types de document « avis d'impot sur le revenu » de la specification. */
export const TYPES_AVIS: readonly string[] = ['04', '28']

export type Code2dDoc = {
  version: string
  autorite: string
  certificat: string
  /** Jour de signature, ou a defaut d'emission, a minuit UTC. */
  date: Date | null
  type: string
  /** En-tete et champs : exactement les octets couverts par la signature. */
  signe: Buffer
  /** Champs seuls, sans l'en-tete. */
  message: Buffer
  signature: Buffer
}

function jour(hexa: string): Date | null {
  if (!/^[0-9A-F]{4}$/.test(hexa) || hexa === 'FFFF') return null
  return new Date(Date.UTC(2000, 0, 1) + parseInt(hexa, 16) * 86_400_000)
}

/** Base32 de la RFC 4648, sans remplissage obligatoire. */
export function decoderBase32(texte: string): Buffer | null {
  const propre = texte.replace(/=+$/, '')
  if (!propre || !/^[A-Z2-7]+$/.test(propre)) return null
  const octets: number[] = []
  let tampon = 0
  let bits = 0
  for (const caractere of propre) {
    tampon = (tampon << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(caractere)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      octets.push((tampon >> bits) & 0xff)
    }
    tampon &= (1 << bits) - 1
  }
  // Les bits de bourrage doivent etre nuls : une seule ecriture par signature.
  if (bits >= 5 || tampon !== 0) return null
  return Buffer.from(octets)
}

/** Decoupe un 2D-Doc. `null` si la chaine n'en a pas la forme. */
export function analyserCode(octets: Buffer): Code2dDoc | null {
  if (octets.length < 40 || octets.length > 2048) return null
  // Texte imprimable et separateurs GS, RS, US uniquement.
  if (octets.some((o) => o < GS || o === 0x7f)) return null
  const texte = octets.toString('latin1')
  if (!texte.startsWith('DC')) return null
  const version = texte.slice(2, 4)
  const taille = ENTETES[version]
  if (!taille) return null
  const entete = texte.slice(0, taille)
  if (!/^DC\d{2}[A-Z0-9]{8}[0-9A-F]{8}[A-Z0-9]{2,6}$/.test(entete)) return null
  const separateur = octets.indexOf(US)
  if (separateur < taille || octets.indexOf(US, separateur + 1) !== -1) return null
  // La version 04 autorise une annexe non signee apres la signature.
  const fin = octets.indexOf(GS, separateur + 1)
  const signature = decoderBase32(
    texte.slice(separateur + 1, fin === -1 ? undefined : fin).trimEnd(),
  )
  if (!signature) return null
  return {
    version,
    autorite: entete.slice(4, 8),
    certificat: entete.slice(8, 12),
    date: jour(entete.slice(16, 20)) ?? jour(entete.slice(12, 16)),
    type: entete.slice(20, 22),
    signe: octets.subarray(0, separateur),
    message: octets.subarray(taille, separateur),
    signature,
  }
}

/**
 * Champs d'un avis d'impot sur le revenu : identifiant, longueur fixe ou
 * longueur maximale. Un champ variable se termine par GS, sauf s'il atteint sa
 * longueur maximale ou la fin du message.
 */
const CHAMPS_AVIS: Readonly<Record<string, { fixe?: number; max?: number }>> = {
  '41': { max: 12 }, // revenu fiscal de reference
  '43': { max: 5 }, // nombre de parts
  '44': { fixe: 13 }, // reference de l'avis
  '45': { fixe: 4 }, // annee des revenus
  '46': { max: 38 }, // declarant 1
  '47': { fixe: 13 }, // numero fiscal du declarant 1
  '48': { max: 38 }, // declarant 2
  '49': { fixe: 13 }, // numero fiscal du declarant 2
  '4A': { fixe: 8 }, // date de mise en recouvrement
}

/**
 * Valeurs signees utiles a la comparaison avec l'avis imprime.
 *
 * Lecture prudente : au premier champ inconnu ou mal forme on s'arrete, et
 * seules les valeurs deja lues et de forme attendue sont rendues. Les numeros
 * fiscaux sont lus pour avancer dans le message et jamais rendus.
 */
export function lireValeursAvis(message: Buffer): ValeursAvis {
  const texte = message.toString('latin1')
  const lus = new Map<string, string>()
  let i = 0
  while (i + 2 <= texte.length) {
    const identifiant = texte.slice(i, i + 2)
    const champ = CHAMPS_AVIS[identifiant]
    if (!champ || lus.has(identifiant)) break
    i += 2
    let valeur: string
    if (champ.fixe) {
      valeur = texte.slice(i, i + champ.fixe)
      if (valeur.length !== champ.fixe || valeur.includes('\x1d')) break
      i += champ.fixe
    } else {
      const fin = texte.indexOf('\x1d', i)
      const borne = Math.min(fin === -1 ? texte.length : fin, i + champ.max!)
      valeur = texte.slice(i, borne)
      i = borne
    }
    if (texte[i] === '\x1d') i += 1
    lus.set(identifiant, valeur.trim())
  }
  const valeurs: ValeursAvis = {}
  const forme = (identifiant: string, attendu: RegExp) => {
    const valeur = lus.get(identifiant)
    return valeur && attendu.test(valeur) ? valeur : undefined
  }
  const nom = /^[\p{L}\p{N} .,'/-]{1,38}$/u
  valeurs.annee = forme('45', /^(19|20)\d{2}$/)
  valeurs.revenuFiscalDeReference = forme('41', /^\d{1,12}$/)
  valeurs.parts = forme('43', /^\d{1,3}([.,]\d{1,2})?$/)
  valeurs.reference = forme('44', /^[0-9A-Z]{13}$/)
  const declarants = [forme('46', nom), forme('48', nom)].filter((d): d is string => !!d)
  if (declarants.length) valeurs.declarants = declarants
  return Object.fromEntries(
    Object.entries(valeurs).filter(([, valeur]) => valeur !== undefined),
  ) as ValeursAvis
}
