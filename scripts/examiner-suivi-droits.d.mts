export function examinerSuiviDroits(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  selection: unknown,
): Promise<Record<string, unknown>>
export function configurationLectureDroits(valeur: unknown): {
  connexion: string
  selection: unknown
  locale: boolean
}
export function lireSuiviDroits(valeur: unknown): Promise<Record<string, unknown>>
