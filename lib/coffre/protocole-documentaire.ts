import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Echange signe entre l'application et le service documentaire confine.
 *
 * Partage par les deux cotes : uniquement node:crypto, aucune dependance ni
 * variable d'environnement. TLS authentifie le serveur ; la signature HMAC
 * authentifie l'appelant, borne le rejeu et lie chaque reponse a sa demande.
 */
export const ENTETE_HORODATAGE = 'x-cloison-horodatage'
export const ENTETE_SIGNATURE = 'x-cloison-signature'
export const FENETRE_HORODATAGE = 60_000
export const DEMANDE_MAX = 30 * 1024 * 1024
export const SECRET_MIN = 32

const VERSION = 'cloison-documentaire-v1'
const FORME_SIGNATURE = /^[a-f0-9]{64}$/

function empreinte(corps: Buffer) {
  return createHash('sha256').update(corps).digest('hex')
}

function signer(secret: string, lignes: string[]) {
  if (secret.length < SECRET_MIN) throw new Error('Secret documentaire invalide')
  return createHmac('sha256', secret)
    .update([VERSION, ...lignes].join('\n'))
    .digest('hex')
}

export function signerDemande(secret: string, horodatage: string, corps: Buffer) {
  return signer(secret, ['demande', horodatage, empreinte(corps)])
}

export function signerReponse(
  secret: string,
  signatureDemande: string,
  statut: number,
  corps: Buffer,
) {
  return signer(secret, ['reponse', signatureDemande, String(statut), empreinte(corps)])
}

export function signatureEgale(recue: string | null | undefined, attendue: string) {
  if (typeof recue !== 'string' || !FORME_SIGNATURE.test(recue)) return false
  return timingSafeEqual(Buffer.from(recue), Buffer.from(attendue))
}

/** Horodatage en millisecondes, entier, dans la fenetre autour de maintenant. */
export function horodatageRecent(valeur: string | null | undefined, maintenant = Date.now()) {
  if (typeof valeur !== 'string' || !/^\d{13}$/.test(valeur)) return false
  return Math.abs(maintenant - Number(valeur)) <= FENETRE_HORODATAGE
}
