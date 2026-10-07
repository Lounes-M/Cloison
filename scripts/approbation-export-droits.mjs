import { createHash } from 'node:crypto'
import { z } from 'zod'
import { verifierDecisionPaquet } from './paquet-droits.mjs'

const uuid = z.uuid().transform((v) => v.toLowerCase())
const schema = z.strictObject({
  version: z.literal(1),
  usage: z.literal('export-personnel'),
  demande: uuid,
  revision: uuid,
  operateur: uuid,
  nature: z.enum(['acces', 'portabilite']),
  destinataire: z.strictObject({
    reference: uuid,
    identiteSha256: z.string().regex(/^[a-f0-9]{64}$/),
    mandat: z.enum(['non_requis', 'verifie']),
  }),
  inventaireComplet: z.literal(true),
  revueTiersValidee: z.literal(true),
  creeLe: z.iso.datetime(),
  expireLe: z.iso.datetime(),
  exclusions: z.array(z.string()).max(100),
  fichiers: z.array(z.unknown()).min(1).max(100),
})
const empreinte = (texte) => createHash('sha256').update(texte, 'utf8').digest('hex')

/** Les octets exacts de cette approbation sont la preuve inscrite au registre prive. */
export function lireApprobationExport(brut, maintenant = Date.now()) {
  try {
    if (typeof brut !== 'string' || Buffer.byteLength(brut, 'utf8') > 256 * 1024) throw new Error()
    const a = schema.parse(JSON.parse(brut))
    const decision = verifierDecisionPaquet(
      {
        version: 1,
        demande: a.demande,
        revision: a.revision,
        decisionSha256: empreinte(brut),
        destinataireSha256: empreinte(a.destinataire.reference),
        creeLe: a.creeLe,
        expireLe: a.expireLe,
        exclusions: a.exclusions,
        fichiers: a.fichiers,
      },
      maintenant,
    )
    return { decision, operateur: a.operateur, nature: a.nature }
  } catch {
    throw new Error('Approbation export invalide.')
  }
}
