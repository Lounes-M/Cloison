import Link from 'next/link'
import type { Route } from 'next'
import { cn } from '@/lib/utils'

const tones = {
  cobalt: 'bg-cobalt text-white',
  flame: 'bg-flame text-white',
  paper: 'bg-paper text-ink',
} as const

const sizes = {
  sm: 'px-5 py-2.5 text-sm rounded-[10px] shadow-brut-xs',
  md: 'px-8 py-4 text-[17px] rounded-brut shadow-brut',
} as const

type ButtonProps = {
  /** Ancre de la meme page (`#tarifs`) ou route interne (`/agences`). */
  href: Route | `#${string}`
  children: React.ReactNode
  tone?: keyof typeof tones
  size?: keyof typeof sizes
  className?: string
}

/**
 * CTA « neo-brutaliste » : contour plein, ombre decalee qui se retracte au survol
 * pendant que le bouton glisse de 4 px — il s'enfonce litteralement dans la page.
 */
export function Button({ href, children, tone = 'cobalt', size = 'md', className }: ButtonProps) {
  const classes = cn(
    'press inline-flex items-center justify-center font-bold outlined',
    tones[tone],
    sizes[size],
    className,
  )

  // Une ancre de la meme page n'a rien a prefetcher : `<a>` suffit et evite
  // que le routeur tente une navigation.
  if (href.startsWith('#')) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    )
  }

  return (
    <Link href={href as Route} className={classes}>
      {children}
    </Link>
  )
}
