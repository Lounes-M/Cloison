import 'server-only'
import { join } from 'node:path'
import { executerProcessus } from '@/lib/coffre/processus-limite'
import { lireReponseDocumentaire } from '@/lib/coffre/reponse-document'
import type { PositionSignature } from './position'

export async function verifierProjetActe(pdf: Buffer, position: PositionSignature) {
  if (pdf.length > 4 * 1024 * 1024) throw new Error('Acte trop volumineux')
  const sortie = await executerProcessus(
    join(process.cwd(), 'workers', 'acte.mjs'),
    Buffer.from(
      JSON.stringify({
        contenu: pdf.toString('base64'),
        position: { page: position.page, x: position.x, y: position.y },
      }),
    ),
    { sortieMax: 1024 },
  )
  lireReponseDocumentaire(sortie, 'verifier')
}
