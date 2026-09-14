import type { DecisionPaquet } from './paquet-droits.mjs'
export function verifierSuiviExport(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  valeur: unknown,
): Promise<void>
export function avecSuiviExport<T>(
  valeur: unknown,
  executer: (verifier: (decision: DecisionPaquet) => Promise<void>) => Promise<T>,
): Promise<T>
