import { cn } from '@/lib/utils'

const fonds = {
  nuit: 'from-ink via-night to-[color-mix(in_srgb,var(--color-flame)_22%,var(--color-night))]',
  vert: 'from-[color-mix(in_srgb,var(--color-cobalt)_80%,white)] via-cobalt to-[color-mix(in_srgb,var(--color-cobalt)_70%,black)]',
  orange: 'from-[color-mix(in_srgb,var(--color-flame)_75%,white)] via-flame to-flame-texte',
  rose: 'from-[color-mix(in_srgb,var(--color-sun)_60%,white)] via-sun to-[color-mix(in_srgb,var(--color-sun)_80%,black)]',
  creme: 'from-paper via-cream to-[color-mix(in_srgb,var(--color-cream)_90%,black)]',
} as const

type VisuelProvisoireProps = {
  /** Identifiant stable, pour retrouver l'emplacement quand la photo arrive. */
  nom: string
  fond?: keyof typeof fonds
  className?: string
  children?: React.ReactNode
}

/**
 * Emplacement d'image en attente de son visuel definitif.
 *
 * Il tient les dimensions, l'arrondi et le cadrage de la photo prevue, pour
 * que la mise en page ne bouge pas le jour ou elle arrive. Decoratif : rien
 * n'est annonce aux lecteurs d'ecran. `data-visuel-provisoire` permet de les
 * lister tous d'un `grep`.
 */
export function VisuelProvisoire({
  nom,
  fond = 'vert',
  className,
  children,
}: VisuelProvisoireProps) {
  return (
    <div
      aria-hidden
      data-visuel-provisoire={nom}
      className={cn('relative overflow-hidden bg-gradient-to-br', fonds[fond], className)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.25),transparent_55%)]" />
      {children}
    </div>
  )
}
