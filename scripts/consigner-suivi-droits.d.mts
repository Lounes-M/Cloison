export function configurationSuiviDroits(valeur: unknown): {
  connexion: string
  locale: boolean
  operation: string
  demande: string
  precedente: string | null
  operateur: string
  nature: string
  etat: string
  recuLe: string
  repondreAvant: string
  effacerLe: string
  empreinte: string
}
export function consignerSuiviDroits(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  valeur: unknown,
): Promise<{ cree: boolean }>
export function enregistrerSuiviDroits(valeur: unknown): Promise<{ cree: boolean }>
