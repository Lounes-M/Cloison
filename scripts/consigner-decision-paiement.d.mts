export function configurationDecision(valeur: unknown): {
  connexion: string
  locale: boolean
  operation: string
  operateur: string
  decision: string
  reference: string
  empreinte: string
  observeLe: string
}
export function consignerDecision(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  configuration: unknown,
): Promise<{ cree: boolean }>
export function enregistrerDecision(configuration: unknown): Promise<{ cree: boolean }>
