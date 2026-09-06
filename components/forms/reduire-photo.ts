import { TAILLE_MAX_DEPOT } from '@/lib/garant/validation'

/** Au-dela, une photo est reduite dans le navigateur avant de partir. */
const SEUIL_REDUCTION = 1.2 * 1024 * 1024
const COTE_MAX = 2000

/**
 * Reduit une photo dans le navigateur, sans rien envoyer.
 *
 * Une photo de telephone pese quatre a huit megaoctets, pour un document qui
 * se lit parfaitement a deux mille pixels de cote. La reduire ici fait passer
 * sous la borne pratique sans que la personne ait a s'en occuper, et sans
 * traitement par notre serveur, qui chiffre avant stockage.
 *
 * Rend le fichier tel quel si ce n'est pas une image, s'il est deja leger, ou
 * si le navigateur ne sait pas le decoder : le serveur nommera alors le
 * format, HEIC compris.
 */
export async function reduireSiPhoto(fichier: File): Promise<File> {
  if (!fichier.type.startsWith('image/') || fichier.size <= SEUIL_REDUCTION) return fichier

  let image: ImageBitmap | undefined
  try {
    image = await createImageBitmap(fichier)
    const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height))
    if (echelle === 1 && fichier.size <= TAILLE_MAX_DEPOT) {
      return fichier
    }

    const toile = document.createElement('canvas')
    toile.width = Math.round(image.width * echelle)
    toile.height = Math.round(image.height * echelle)
    const contexte = toile.getContext('2d')
    if (!contexte) return fichier
    // Le JPEG ne conserve pas la transparence : un fond blanc protege la
    // lisibilite des scans dont le papier est transparent.
    contexte.fillStyle = '#fff'
    contexte.fillRect(0, 0, toile.width, toile.height)
    contexte.drawImage(image, 0, 0, toile.width, toile.height)

    const blob = await new Promise<Blob | null>((resoudre) =>
      toile.toBlob(resoudre, 'image/jpeg', 0.85),
    )
    if (!blob) return fichier

    return new File([blob], fichier.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return fichier
  } finally {
    image?.close()
  }
}
