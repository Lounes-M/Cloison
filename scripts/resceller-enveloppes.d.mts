import type { Trousseau } from '../lib/coffre/rotation-format'
export function rescellerEnveloppes(
  db: {
    query: (
      sql: string,
      params: unknown[],
    ) => Promise<{ rows: { id: string; contenu?: Buffer | string }[] }>
  },
  trousseau: Trousseau,
  options?: { appliquer?: boolean; maximum?: number },
): Promise<{
  examinees: number
  a_resceller: number
  rescellees: number
  courses: number
  echecs: number
  limite: boolean
}>
