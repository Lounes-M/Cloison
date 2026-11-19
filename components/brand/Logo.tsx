import Link from 'next/link'
import { cn } from '@/lib/utils'

import { lien, type Langue } from '@/lib/i18n'

type LogoProps = {
  /** `default` sur fond clair, `inverse` sur fond sombre, `white` sur cobalt. */
  variant?: 'default' | 'inverse' | 'white'
  /** Rendu en lien vers l'accueil. Mettre `false` pour un usage décoratif. */
  asLink?: boolean
  className?: string
  /** La langue du lien vers l'accueil et de son libelle. */
  langue?: Langue
}

/**
 * Le logo Cloison est du texte, pas une image : Poppins demi-gras + une barre orange en CSS.
 * Il reste vectoriel à toute taille, pèse 0 Ko et hérite de la couleur du fond.
 * Sa taille se règle uniquement via `font-size` (classe `text-*`).
 */
export function Logo({ variant = 'default', asLink = true, className, langue = 'fr' }: LogoProps) {
  const content = (
    <>
      CLOI
      <span
        aria-hidden
        className="bg-flame mx-[0.08em] inline-block h-[1.1em] w-[0.28em] rotate-6 rounded-[0.14em]"
      />
      SON
    </>
  )

  const classes = cn(
    'inline-flex select-none items-center gap-[0.08em] font-display leading-none tracking-normal',
    variant === 'default' && 'text-ink',
    variant === 'inverse' && 'text-cream',
    variant === 'white' && 'text-white',
    className,
  )

  if (!asLink) {
    return (
      <span className={classes} aria-label="Cloison">
        {content}
      </span>
    )
  }

  return (
    <Link
      href={lien(langue, '/')}
      // La zone de toucher deborde du mot pour atteindre 44 px de haut.
      className={cn(
        classes,
        "relative after:absolute after:-inset-x-2 after:-inset-y-[10px] after:content-['']",
      )}
      aria-label={langue === 'en' ? 'Cloison, home' : 'Cloison, accueil'}
    >
      {content}
    </Link>
  )
}
