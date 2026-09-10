export function configurationDiagnostic(valeur: unknown): {
  connexion: string
  destination: string
  reference: string
  locale: boolean
}
export function ecrireDiagnostic(destination: string, diagnostic: unknown): Promise<void>
export function examinerPaiement(configuration: unknown): Promise<void>
