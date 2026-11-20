import { cn } from '@/lib/utils'

const points = {
  sky: 'bg-sky',
  sun: 'bg-sun',
  mint: 'bg-mint',
  flame: 'bg-flame border-flame',
  paper: 'bg-paper',
} as const

export type TonRepere = keyof typeof points

/**
 * Un libellé précédé d'un point de couleur, comme les surtitres du site
 * public. Remplace les pastilles pleines : le texte reste du texte.
 */
export function Repere({
  ton,
  children,
  className,
  as: Balise = 'span',
}: {
  ton: TonRepere
  children: React.ReactNode
  className?: string
  as?: 'span' | 'p' | 'li'
}) {
  return (
    <Balise className={cn('flex items-baseline gap-[0.5em] font-semibold', className)}>
      <span
        aria-hidden
        className={cn(
          'border-ink/35 inline-block size-[0.6em] shrink-0 -translate-y-[0.05em] rounded-full border',
          points[ton],
        )}
      />
      <span>{children}</span>
    </Balise>
  )
}
