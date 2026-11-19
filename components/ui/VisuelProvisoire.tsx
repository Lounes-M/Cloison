import { cn } from '@/lib/utils'

const fonds = {
  nuit: 'from-[#2a2a2a] via-[#151515] to-[#3a2116]',
  vert: 'from-[#0b6b55] via-cobalt to-[#023b2f]',
  orange: 'from-[#ff7a3d] via-flame to-[#b83a00]',
  rose: 'from-[#f6d3e6] via-sun to-[#d98fb8]',
  creme: 'from-paper via-cream to-[#eadfce]',
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
