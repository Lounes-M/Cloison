import Image from 'next/image'
import { cn } from '@/lib/utils'

type PhotoProps = {
  /** Chemin sous `public/`, par exemple `/accueil/intro-1.jpg`. */
  src: string
  /** Largeur affichee, pour que Next choisisse la bonne taille de fichier. */
  sizes: string
  className?: string
  /** Cadrage dans le cadre, par exemple `object-[70%_50%]`. */
  cadrage?: string
  priority?: boolean
}

/**
 * Photo d'ambiance, decorative : elle remplit son cadre, garde l'arrondi et
 * le decoupage du conteneur, et n'est pas annoncee aux lecteurs d'ecran.
 * Le texte voisin porte deja le sens.
 */
export function Photo({ src, sizes, className, cadrage, priority }: PhotoProps) {
  return (
    <div aria-hidden className={cn('bg-fog relative overflow-hidden', className)}>
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className={cn('object-cover', cadrage)}
      />
    </div>
  )
}
