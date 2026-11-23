import type { PropositionRemboursement } from './preparer-remboursement.mjs'

type ApiRemboursement = {
  paymentIntents: {
    retrieve: (id: string, options: { expand: string[] }) => Promise<unknown>
  }
  refunds: {
    create: (
      parametres: Record<string, unknown>,
      options: { idempotencyKey: string },
    ) => Promise<unknown>
  }
}
export function phraseDeConfirmation(proposition: PropositionRemboursement): string
export function configurationExecution(
  valeur: unknown,
  maintenant?: number,
): { cle: string; operation: string; empreinte: string; proposition: PropositionRemboursement }
export function executerRemboursement(
  api: ApiRemboursement,
  configuration: unknown,
  maintenant?: number,
): Promise<{ etat: 'succeeded' | 'pending' }>
