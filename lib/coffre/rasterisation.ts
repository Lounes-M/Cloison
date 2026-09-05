import 'server-only'
import type { TypeAccepte } from './type-reel'
import { traiterDocument } from './traitement-document'

/** Le decodeur tourne hors du processus web et ne recoit aucune cle du coffre. */
export async function rasteriser(
  contenu: Buffer,
  type: TypeAccepte,
  filigrane: string,
): Promise<Buffer> {
  return traiterDocument(contenu, type, filigrane, 'rasteriser')
}
