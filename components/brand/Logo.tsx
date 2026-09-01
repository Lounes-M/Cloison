import Link from 'next/link'
import { cn } from '@/lib/utils'

type LogoProps = {
  /** `default` sur fond clair, `inverse` sur fond sombre, `white` sur cobalt. */
  variant?: 'default' | 'inverse' | 'white'
  /** Rendu en lien vers l'accueil. Mettre `false` pour un usage décoratif. */
  asLink?: boolean
  className?: string
}

/**
 * Le logo Cloison est du texte, pas une image : Archivo Black + une barre CSS.
 * Il reste vectoriel à toute taille, pèse 0 Ko et hérite de la couleur du fond.
 * Sa taille se règle uniquement via `font-size` (classe `text-*`).
 */
export function Logo({ variant = 'default', asLink = true, className }: LogoProps) {
  const content = (
    <>
      CLOI
      <span
        aria-hidden
        className={cn(
          'bg-sun mx-[0.08em] inline-block h-[1.25em] w-[0.32em] rotate-6 rounded-[0.16em] border-[0.07em]',
          variant === 'inverse' ? 'border-cream' : 'border-ink',
        )}
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
    <Link href="/" className={classes} aria-label="Cloison — accueil">
      {content}
    </Link>
  )
}
