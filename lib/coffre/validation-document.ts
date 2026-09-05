import 'server-only'
import type { TypeAccepte } from './type-reel'
import { traiterDocument } from './traitement-document'

export {
  verifierDimensions,
  dimensionsImage,
  DIMENSION_MAX,
  PIXELS_MAX,
} from '../../workers/dimensions.ts'
export async function verifierDocument(contenu: Buffer, type: TypeAccepte) {
  await traiterDocument(contenu, type, '', 'verifier')
}
