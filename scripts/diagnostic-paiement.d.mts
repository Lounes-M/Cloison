export type DiagnosticPaiement = {
  version: 1
  observe_le: string | Date
  reference_session: string
  reservation: Record<string, unknown>[]
  registre: Record<string, unknown>[]
  observations: Record<string, unknown>[]
  evenements: Record<string, unknown>[]
  sessions_associees: Record<string, unknown>[]
  tentatives: Record<string, unknown>[]
  tarifs: Record<string, unknown>[]
}
export function diagnostiquerPaiement(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  reference: string,
): Promise<DiagnosticPaiement>
