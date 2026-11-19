import Link from 'next/link'
import type { Route } from 'next'
import { Icone } from '@/components/ui/Icone'
import { cn } from '@/lib/utils'

/** Couleur de l'etiquette. La case de la fleche reste orange, sauf sur `flame`. */
const tones = {
  cobalt: 'bg-cobalt text-white',
  flame: 'bg-flame text-ink',
  paper: 'bg-paper text-ink',
  sun: 'bg-sun text-ink',
} as const

/** Hauteur de la commande : 3,25 rem comme la reference, jamais moins de 44 px. */
const sizes = {
  sm: 'text-sm font-semibold [--bouton-h:max(44px,2.75rem)]',
  md: 'text-[1.125rem] leading-[1.4] font-semibold [--bouton-h:max(44px,3.25rem)] max-[479px]:text-[1rem]',
} as const

type CommonProps = {
  children: React.ReactNode
  tone?: keyof typeof tones
  size?: keyof typeof sizes
  className?: string
}

/** Destination : ancre de la meme page (`#tarifs`) ou route interne (`/agences`). */
type LinkProps = CommonProps & {
  href: Route | `#${string}`
  onClick?: never
  type?: never
}

/** Action : le bouton declenche du code au lieu de naviguer. */
type ActionProps = CommonProps & {
  onClick: () => void
  href?: never
  type?: 'button' | 'submit'
}

/**
 * Bouton sans destination : celle qu'il ouvrira n'existe pas encore.
 *
 * Explicite, et pas devine : un `href` oublie doit rester une erreur de
 * typage, jamais un bouton mort qui passe inapercu.
 */
type InerteProps = CommonProps & {
  inerte: true
  href?: never
  onClick?: never
  type?: never
}

type ButtonProps = LinkProps | ActionProps | InerteProps

/**
 * Le bouton de la marque : une etiquette pleine et, collee a elle, une case
 * orange qui porte la fleche. Au survol, la fleche passe de l'autre cote de
 * l'etiquette : le mouvement dit qu'on avance, sans rien deplacer d'autre.
 *
 * Rend l'element juste : `<button>` pour une action, `<a>` pour une ancre de la
 * meme page (rien a prefetcher), `<Link>` pour une vraie navigation.
 */
export function Button({
  children,
  tone = 'cobalt',
  size = 'md',
  className,
  ...rest
}: ButtonProps) {
  const classes = cn(
    'bouton group inline-flex max-w-full cursor-pointer items-stretch gap-[0.22rem] text-left',
    sizes[size],
    className,
  )
  const fleche = tone === 'flame' ? 'bg-ink text-white' : 'bg-flame text-white'
  const content = (
    <>
      <span aria-hidden className={cn('bouton-fleche bouton-fleche-avant', fleche)}>
        <Icone nom="fleche" />
      </span>
      <span
        className={cn(
          'rounded-brut flex min-h-[var(--bouton-h)] items-center px-[0.625rem] leading-tight',
          tones[tone],
        )}
      >
        {children}
      </span>
      <span aria-hidden className={cn('bouton-fleche bouton-fleche-apres', fleche)}>
        <Icone nom="fleche" />
      </span>
    </>
  )

  if ('inerte' in rest) {
    return (
      <button type="button" className={classes}>
        {content}
      </button>
    )
  }

  if (rest.onClick) {
    return (
      <button type={rest.type ?? 'button'} onClick={rest.onClick} className={classes}>
        {content}
      </button>
    )
  }

  if (rest.href.startsWith('#')) {
    return (
      <a href={rest.href} className={classes}>
        {content}
      </a>
    )
  }

  return (
    <Link href={rest.href as Route} className={classes}>
      {content}
    </Link>
  )
}
