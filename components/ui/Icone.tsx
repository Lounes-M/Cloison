import { cn } from '@/lib/utils'

/**
 * Le jeu d'icones de la marque.
 *
 * Aucun emoji nulle part : un emoji est dessine par le systeme, donc il change
 * de forme et de couleur d'un appareil a l'autre, ignore la charte et refuse de
 * suivre la couleur du texte qui l'entoure. Ces traces sont geometriques,
 * dessines sur la meme grammaire que les contours et les ombres du site :
 * traits de 2 px, extremites carrees, angles francs.
 *
 * Elles heritent de `currentColor`, donc une icone posee sur un fond sombre
 * suit la couleur du texte sans qu'on ait a la redeclarer.
 */

const traces = {
  /** Validation, etat verifie. */
  coche: <path d="M4 12.5 10 19 20 5" />,

  /** Ce que le garant depose reste ferme. */
  cadenas: (
    <>
      <path d="M4 10h16v11H4z" />
      {/* L'anse est arrondie et etroite : carree et large, elle se lit comme
          la poignee d'une mallette et plus du tout comme un cadenas. */}
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),

  /** Une piece jointe, un document depose. */
  fichier: (
    <>
      <path d="M13 3H6v18h12V8z" />
      <path d="M13 3v5h5" />
    </>
  ),

  /** L'acte, une fois signe. */
  acte: (
    <>
      <path d="M5 3h14v18H5z" />
      <path d="M8.5 12.5 11 15l4.5-5" />
    </>
  ),

  /** Le moment, l'urgence. */
  eclair: <path d="M13 2 5 13h6l-2 9 8-11h-6z" />,

  /** Ornement : l'asterisque de la marque. */
  asterisque: (
    <>
      <path d="M12 3v18" />
      <path d="M3.8 7.5l16.4 9" />
      <path d="M20.2 7.5l-16.4 9" />
    </>
  ),

  /**
   * Ornement : la ponctuation du bandeau defilant.
   *
   * Pleine et non en contour : a 16 px, une etoile creuse se lit comme une
   * croix bancale. C'est la seule du jeu qui deroge au trace au trait.
   */
  etoile: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2l1.8 8.2L22 12l-8.2 1.8L12 22l-1.8-8.2L2 12l8.2-1.8z"
    />
  ),
} as const

export type NomIcone = keyof typeof traces

type IconeProps = {
  nom: NomIcone
  className?: string
  /**
   * Texte de remplacement. Omis, l'icone est decorative et disparait des
   * lecteurs d'ecran : ce qui est le bon defaut : la plupart accompagnent un
   * libelle qui dit deja la meme chose.
   */
  titre?: string
}

export function Icone({ nom, className, titre }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={cn('inline-block size-[1.1em] shrink-0 align-[-0.15em]', className)}
      role={titre ? 'img' : undefined}
      aria-label={titre}
      aria-hidden={titre ? undefined : true}
    >
      {traces[nom]}
    </svg>
  )
}
