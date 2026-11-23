import type { DiagnosticPaiement } from './diagnostic-paiement.mjs'
import type { CalculRemboursement } from '../lib/exploitation/remboursement-prorata.mjs'

export const FORMAT_REMBOURSEMENT: 'cloison-remboursement-prorata-v1'
export type PropositionRemboursement = {
  version: 1
  observe_le: string
  reference_session: string
  eligible: boolean
  motifs: string[]
} & Partial<
  CalculRemboursement & {
    reference_paiement: string | null
    devise: string
    montant_paye_cents: number
    paye_le: string
  }
>
export function configurationRemboursement(valeur: unknown): {
  connexion: string
  destination: string
  reference: string
  locale: boolean
  demandeJour: string
}
export function proposerRemboursement(
  diagnostic: DiagnosticPaiement,
  demandeJour: string,
): PropositionRemboursement
export function preparerRemboursement(configuration: unknown): Promise<boolean>
