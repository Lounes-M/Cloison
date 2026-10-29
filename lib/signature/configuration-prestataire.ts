import 'server-only'
import { z } from 'zod'
import { clientDocageConfigure } from './configuration-docage'
import { clientYoutrustConfigure } from './configuration-youtrust'
import type { EtatDemandeSignature, PrestataireSignature } from './prestataire'

/**
 * Le prestataire actif. Docage par defaut ; Youtrust reste branche en secours
 * et se reactive par la seule variable SIGNATURE_PRESTATAIRE=youtrust, sans
 * changement de code ni de base : le registre ne connait que des identifiants
 * UUID et le vocabulaire d'etat commun.
 */
export const nomPrestataire = z.enum(['docage', 'youtrust'])
export type NomPrestataire = z.infer<typeof nomPrestataire>
export const environnementSignature = z.enum(['sandbox', 'production'])

export function prestataireActif(): NomPrestataire {
  const valeur = process.env.SIGNATURE_PRESTATAIRE?.trim()
  return nomPrestataire.parse(valeur ? valeur : 'docage')
}

export function modeSignature() {
  return environnementSignature.parse(process.env.SIGNATURE_ENVIRONMENT)
}

export const registreSignatureActif = () => process.env.SIGNATURE_REGISTRE_ENABLED === 'true'
export const mutationsSignatureAutorisees = () => process.env.SIGNATURE_MUTATIONS_ENABLED === 'true'

export type ClientSignature = PrestataireSignature & {
  lirePourRapprochement(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ id: string; external_id: string; status: EtatDemandeSignature }>
}

export function clientSignatureConfigure(signal?: AbortSignal): ClientSignature {
  return prestataireActif() === 'youtrust'
    ? clientYoutrustConfigure(signal)
    : clientDocageConfigure(signal)
}
