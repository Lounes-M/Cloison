import { randomUUID } from 'node:crypto'
import type { ApprobationExport } from '../scripts/approbation-export-droits.mjs'
import type { DecisionPaquet } from '../scripts/paquet-droits.mjs'

export function approbationFictive(
  d: Pick<
    DecisionPaquet,
    'demande' | 'revision' | 'creeLe' | 'expireLe' | 'exclusions' | 'fichiers'
  >,
): ApprobationExport {
  return {
    version: 1,
    usage: 'export-personnel',
    demande: d.demande,
    revision: d.revision,
    operateur: randomUUID(),
    nature: 'acces',
    destinataire: { reference: randomUUID(), identiteSha256: 'c'.repeat(64), mandat: 'non_requis' },
    inventaireComplet: true,
    revueTiersValidee: true,
    creeLe: d.creeLe,
    expireLe: d.expireLe,
    exclusions: d.exclusions,
    fichiers: d.fichiers,
  }
}
