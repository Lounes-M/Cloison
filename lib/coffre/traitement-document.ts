import 'server-only'
import { join } from 'node:path'
import { executerProcessus } from './processus-limite'
import { configurationMoteurDistant, executerMoteurDistant } from './moteur-distant'
import type { TypeAccepte } from './type-reel'

import { lireReponseDocumentaire } from './reponse-document'

export async function traiterDocument(
  contenu: Buffer,
  type: TypeAccepte,
  filigrane: string,
  operation: 'verifier' | 'rasteriser',
): Promise<Buffer>
export async function traiterDocument(
  contenu: Buffer,
  type: TypeAccepte,
  filigrane: string,
  operation: 'rasteriser',
  pagination: true,
): Promise<{ pdf: Buffer; pages: number }>
export async function traiterDocument(
  contenu: Buffer,
  type: TypeAccepte,
  filigrane: string,
  operation: 'verifier' | 'rasteriser',
  pagination = false,
) {
  const demande = Buffer.from(
    JSON.stringify({
      operation,
      type,
      filigrane,
      contenu: contenu.toString('base64'),
      ...(pagination ? { pagination: true } : {}),
    }),
  )
  // Service confine si configure, sans repli local ; processus local sinon.
  const distant = configurationMoteurDistant()
  const sortie = distant
    ? await executerMoteurDistant(demande, distant)
    : await executerProcessus(join(process.cwd(), 'workers', 'document.mjs'), demande)
  return pagination
    ? lireReponseDocumentaire(sortie, 'rasteriser', true)
    : lireReponseDocumentaire(sortie, operation)
}
