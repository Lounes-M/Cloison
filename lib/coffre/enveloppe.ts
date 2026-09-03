import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Le chiffrement par enveloppe des pieces.
 *
 * Chaque dossier recoit sa propre cle de donnees (DEK). Les pieces sont
 * chiffrees avec elle avant de partir vers Storage : Supabase ne recoit jamais
 * un octet lisible. La DEK elle-meme est chiffree par la cle maitresse (KEK),
 * qui vit chez Vercel.
 *
 * C'est le point qui porte l'ADR 0003 : le chiffre est chez Supabase, la cle
 * est ailleurs. Compromettre l'un ne donne rien sans l'autre.
 *
 * AES-256-GCM par le module `crypto` de Node, sans dependance nouvelle. Le
 * mode authentifie n'est pas un detail : sans lui, un octet modifie rendrait
 * de la bouillie que rien ne distinguerait d'un document, la ou GCM refuse
 * d'ouvrir. Consequence a connaitre : les routes qui chiffrent tournent en
 * runtime Node, pas Edge.
 *
 * Ce module ne connait ni Supabase ni l'environnement : il prend des cles et
 * rend des octets. Il est donc entierement testable, ce qui est precisement ce
 * qu'on veut du seul code du produit dont une erreur ne se voit pas.
 */

const ALGORITHME = 'aes-256-gcm'

/** 32 octets : c'est ce que « 256 » veut dire, et AES-256 n'accepte rien d'autre. */
export const TAILLE_CLE = 32

/** 12 octets, la taille recommandee pour GCM. Plus long serait rehache. */
const TAILLE_NONCE = 12

/** 16 octets, produits par GCM et necessaires pour ouvrir. */
const TAILLE_MARQUE = 16

/**
 * Format scelle : nonce (12) puis marque d'authenticite (16) puis chiffre.
 *
 * Un seul tampon plutot que trois colonnes : il n'y a alors aucune facon de
 * ranger le nonce d'un document avec le chiffre d'un autre, ni d'oublier de
 * stocker la marque. Ce qui se perd ensemble ne peut pas se desynchroniser.
 */
const DEBUT_CHIFFRE = TAILLE_NONCE + TAILLE_MARQUE

function verifierCle(cle: Buffer, quoi: string) {
  if (cle.length !== TAILLE_CLE) {
    throw new Error(`${quoi} doit faire ${TAILLE_CLE} octets, elle en fait ${cle.length}.`)
  }
}

/** Une cle de donnees neuve, pour un dossier neuf. */
export function nouvelleCle(): Buffer {
  return randomBytes(TAILLE_CLE)
}

/**
 * Scelle un contenu avec une cle.
 *
 * Le nonce est tire a chaque appel, jamais derive ni reutilise : rejouer un
 * nonce avec la meme cle est, en GCM, ce qui casse tout. Deux appels sur le
 * meme contenu produisent donc deux resultats differents, et c'est voulu.
 */
export function sceller(contenu: Buffer, cle: Buffer): Buffer {
  verifierCle(cle, 'La cle de chiffrement')

  const nonce = randomBytes(TAILLE_NONCE)
  const chiffreur = createCipheriv(ALGORITHME, cle, nonce)
  const chiffre = Buffer.concat([chiffreur.update(contenu), chiffreur.final()])

  return Buffer.concat([nonce, chiffreur.getAuthTag(), chiffre])
}

/**
 * Ouvre un contenu scelle, ou echoue.
 *
 * Echoue et ne devine pas : une cle fausse, un octet modifie ou un tampon
 * tronque levent tous, plutot que de rendre des octets qu'on prendrait pour un
 * document. C'est la seule raison d'avoir choisi un mode authentifie.
 */
export function ouvrir(scelle: Buffer, cle: Buffer): Buffer {
  verifierCle(cle, 'La cle de dechiffrement')

  if (scelle.length < DEBUT_CHIFFRE) {
    throw new Error('Contenu scelle trop court : il manque le nonce ou la marque.')
  }

  const nonce = scelle.subarray(0, TAILLE_NONCE)
  const marque = scelle.subarray(TAILLE_NONCE, DEBUT_CHIFFRE)
  const chiffre = scelle.subarray(DEBUT_CHIFFRE)

  const dechiffreur = createDecipheriv(ALGORITHME, cle, nonce)
  dechiffreur.setAuthTag(marque)

  // `final()` leve si la marque ne correspond pas. On laisse passer l'erreur
  // telle quelle : elle ne dit rien d'exploitable, et l'attraper pour renvoyer
  // un contenu vide serait pire que tout.
  return Buffer.concat([dechiffreur.update(chiffre), dechiffreur.final()])
}

/**
 * Deux cles sont-elles la meme, sans fuite par le temps de reponse.
 *
 * Une comparaison ordinaire s'arrete au premier octet different, ce qui
 * renseigne sur le prefixe correct. Utilisee nulle part en chemin critique
 * aujourd'hui, mais la comparaison naive serait tentante le jour ou elle le
 * deviendrait.
 */
export function memeCle(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}
