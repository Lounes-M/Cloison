export type StatutConnecteur = {
  reference: string
  etat: 'a_completer' | 'pret' | 'en_cours' | 'signe' | 'clos'
}
export class ErreurLectureStatuts extends Error {
  constructor(code: string, reessayerApres?: number | null)
  code: string
  reessayerApres: number | null
}
export function lireTousLesStatuts(
  cle: string,
  options?: { signal?: AbortSignal; requete?: typeof fetch },
): Promise<{
  version: 1
  debutLe: string
  termineLe: string
  pages: number
  dossiers: StatutConnecteur[]
}>
