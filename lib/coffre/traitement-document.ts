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
  const sortie = await executerProcessus(
    join(process.cwd(), 'workers', 'document.mjs'),
    Buffer.from(
      JSON.stringify({
        operation,
        type,
        filigrane,
        contenu: contenu.toString('base64'),
        ...(pagination ? { pagination: true } : {}),
      }),
    ),
  )
  return pagination
    ? lireReponseDocumentaire(sortie, 'rasteriser', true)
    : lireReponseDocumentaire(sortie, operation)
}
