import { verify } from 'node:crypto'

import { analyserCode, lireValeursAvis, TYPES_AVIS } from './format.ts'
import { emetteurDeConfiance, type Telechargement } from './confiance.ts'
import type { Autorite } from './autorites.ts'
import type { Verification2dDoc } from './resultat.ts'

/**
 * Ce que l'agence apprend du code 2D-Doc d'un avis d'imposition.
 *
 * Deux reponses seulement. « authentique » : le code a ete signe par un
 * emetteur reconnu par l'ANTS, et voici les valeurs qu'il a signees.
 * « non verifiable » : nous n'avons pas pu l'etablir. Il n'existe pas de
 * troisieme reponse : une photo floue, un avis ancien, un certificat
 * injoignable et un code altere se ressemblent trop pour qu'un programme
 * accuse quelqu'un. La decision reste humaine (ADR 0009).
 *
 * Un code authentique ne dit rien du reste de la page. C'est pourquoi les
 * valeurs signees sont rendues : l'agence les compare a ce qui est imprime.
 */

const COURBES: Readonly<Record<string, { taille: number; condensat: string }>> = {
  prime256v1: { taille: 32, condensat: 'sha256' },
  secp384r1: { taille: 48, condensat: 'sha384' },
  secp521r1: { taille: 66, condensat: 'sha512' },
}

const NON_ETABLI = { etat: 'non_verifiable', motif: 'non_etabli' } as const

/**
 * Verifie les octets d'un 2D-Doc lus par le moteur confine.
 *
 * `octets` vide : la piece ne porte pas de code lisible.
 */
export async function verifierCode2dDoc(
  octets: Buffer,
  options: {
    telecharger?: Telechargement
    autorites?: Readonly<Record<string, Autorite>>
    maintenant?: Date
  } = {},
): Promise<Verification2dDoc> {
  if (!octets.length) return { etat: 'non_verifiable', motif: 'aucun_code' }
  const code = analyserCode(octets)
  if (!code || !code.date || !TYPES_AVIS.includes(code.type)) return NON_ETABLI
  // Un document date de demain n'a pas pu etre signe.
  if (code.date.getTime() > (options.maintenant ?? new Date()).getTime() + 86_400_000)
    return NON_ETABLI
  const emetteur = await emetteurDeConfiance(
    code.autorite,
    code.certificat,
    code.date,
    options.telecharger,
    options.autorites,
  )
  if (!emetteur) return NON_ETABLI
  const cle = emetteur.certificat.publicKey
  const courbe = COURBES[cle.asymmetricKeyDetails?.namedCurve ?? '']
  if (!courbe || code.signature.length !== 2 * courbe.taille) return NON_ETABLI
  let valide = false
  try {
    valide = verify(
      courbe.condensat,
      code.signe,
      { key: cle, dsaEncoding: 'ieee-p1363' },
      code.signature,
    )
  } catch {
    valide = false
  }
  if (!valide) return NON_ETABLI
  return {
    etat: 'authentique',
    emetteur: emetteur.organisation,
    signeLe: code.date.toISOString().slice(0, 10),
    valeurs: lireValeursAvis(code.message),
  }
}
