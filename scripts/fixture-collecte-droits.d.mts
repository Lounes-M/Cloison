import type { BaseCollecte } from '../lib/droits/collecte'
export function fixtureCollecteDroits(
  db: BaseCollecte,
  nature?: string,
): Promise<{
  brut: string
  decision: {
    version: number
    demande: string
    revision: string
    operateur: string
    nature: string
    destinataire: { reference: string; email: string; identiteSha256: string; mandat: string }
    expireLe: string
    dossiers: { id: string; partie: string }[]
  }
  garant: string
  locataire: string
  etranger: string
}>
