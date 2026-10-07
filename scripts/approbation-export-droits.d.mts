import type { DecisionPaquet } from './paquet-droits.mjs'
export type ApprobationExport = {
  version: 1
  usage: 'export-personnel'
  demande: string
  revision: string
  operateur: string
  nature: 'acces' | 'portabilite'
  destinataire: { reference: string; identiteSha256: string; mandat: 'non_requis' | 'verifie' }
  inventaireComplet: true
  revueTiersValidee: true
  creeLe: string
  expireLe: string
  exclusions: string[]
  fichiers: DecisionPaquet['fichiers']
}
export function lireApprobationExport(
  brut: unknown,
  maintenant?: number,
): {
  decision: DecisionPaquet
  operateur: string
  nature: 'acces' | 'portabilite'
}
