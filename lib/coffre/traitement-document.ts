import 'server-only'
import { join } from 'node:path'
import { executerProcessus } from './processus-limite'
import type { TypeAccepte } from './type-reel'

import { lireReponseDocumentaire } from './reponse-document'

export async function traiterDocument(
  contenu: Buffer,
  type: TypeAccepte,
  filigrane: string,
  operation: 'verifier' | 'rasteriser',
) {
  const sortie = await executerProcessus(
    join(process.cwd(), 'workers', 'document.mjs'),
    Buffer.from(
      JSON.stringify({ operation, type, filigrane, contenu: contenu.toString('base64') }),
    ),
  )
  return lireReponseDocumentaire(sortie, operation)
}
