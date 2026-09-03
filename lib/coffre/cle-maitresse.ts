import 'server-only'

import { TAILLE_CLE } from './enveloppe'

/**
 * La cle maitresse, et la seule facon d'y toucher.
 *
 * Elle vit chez Vercel, jamais chez Supabase : c'est tout l'interet de l'ADR
 * 0003. Mettre la KEK a cote du chiffre reviendrait a payer la complexite du
 * chiffrement sans acheter aucune garantie, puisque les deux partageraient le
 * meme rayon d'explosion.
 *
 * Elle est lue paresseusement et jamais mise en cache dans un module : un
 * secret garde en variable de module survit aux rechargements a chaud et
 * traine plus longtemps en memoire que necessaire.
 */

/** Le nom de la variable, cite tel quel dans les messages d'erreur. */
const VARIABLE = 'CLE_MAITRESSE'

export function cleMaitresse(): Buffer {
  const brute = process.env[VARIABLE]?.trim()

  if (!brute) {
    throw new Error(
      `${VARIABLE} est absente. Genere-la avec ` +
        `\`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\` ` +
        `et pose-la dans les variables d'environnement du projet.`,
    )
  }

  const cle = Buffer.from(brute, 'base64')

  // Une KEK trop courte est le genre d'erreur qui ne se voit pas : le
  // chiffrement fonctionnerait avec une cle de seize octets mal decodee, et on
  // ne s'en apercevrait qu'a l'audit. On echoue donc a la lecture.
  if (cle.length !== TAILLE_CLE) {
    throw new Error(
      `${VARIABLE} doit valoir ${TAILLE_CLE} octets une fois decodee en base64, ` +
        `elle en fait ${cle.length}. Une valeur tronquee ou mal copiee donne ce resultat.`,
    )
  }

  return cle
}
