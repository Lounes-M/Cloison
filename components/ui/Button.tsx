import Link from 'next/link'
import type { Route } from 'next'
import { cn } from '@/lib/utils'

const tones = {
  cobalt: 'bg-cobalt text-white',
  flame: 'bg-flame text-white',
  paper: 'bg-paper text-ink',
  sun: 'bg-sun text-ink',
} as const

const sizes = {
  sm: 'px-5 py-2.5 text-sm rounded-[10px] shadow-brut-xs',
  md: 'px-8 py-4 text-[17px] rounded-brut shadow-brut',
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
 * CTA « neo-brutaliste » : contour plein, ombre decalee qui se retracte au survol
 * pendant que le bouton glisse de 4 px : il s'enfonce litteralement dans la page.
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
    'press inline-flex cursor-pointer items-center justify-center font-bold outlined',
    tones[tone],
    sizes[size],
    className,
  )

  if ('inerte' in rest) {
    return (
      <button type="button" className={classes}>
        {children}
      </button>
    )
  }

  if (rest.onClick) {
    return (
      <button type={rest.type ?? 'button'} onClick={rest.onClick} className={classes}>
        {children}
      </button>
    )
  }

  if (rest.href.startsWith('#')) {
    return (
      <a href={rest.href} className={classes}>
        {children}
      </a>
    )
  }

  return (
    <Link href={rest.href as Route} className={classes}>
      {children}
    </Link>
  )
}
