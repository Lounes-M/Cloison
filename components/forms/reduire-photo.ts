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
  if (
    !['image/jpeg', 'image/png'].includes(fichier.type) ||
    fichier.size <= SEUIL_REDUCTION ||
    fichier.size > 20 * 1024 * 1024
  )
    return fichier

  let expire = false
  let minuterie: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reduire(),
      new Promise<File>((resolve) => {
        minuterie = setTimeout(() => {
          expire = true
          resolve(fichier)
        }, 10000)
      }),
    ])
  } finally {
    clearTimeout(minuterie)
  }

  async function reduire(): Promise<File> {
    let image: ImageBitmap | undefined
    try {
      image = await createImageBitmap(fichier)
      if (expire) return fichier
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
      image.close()
      image = undefined

      const blob = await new Promise<Blob | null>((resoudre) =>
        toile.toBlob(resoudre, 'image/jpeg', 0.85),
      )
      if (expire || !blob || blob.size === 0 || blob.size >= fichier.size) return fichier

      return new File([blob], fichier.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
    } catch {
      return fichier
    } finally {
      image?.close()
    }
  }
}
