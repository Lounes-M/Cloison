import { cn } from '@/lib/utils'

type SectionProps = {
  children: React.ReactNode
  /** Ancre de navigation (`#produit`, `#tarifs`…). */
  id?: string
  className?: string
  /** Largeur du contenu interne. `false` pour gérer soi-même. */
  contained?: boolean
  innerClassName?: string
}

/** Conteneur de section : gouttières horizontales et largeur max homogènes. */
export function Section({
  children,
  id,
  className,
  contained = true,
  innerClassName,
}: SectionProps) {
  return (
    <section id={id} className={cn('px-6 md:px-10', className)}>
      {contained ? (
        <div className={cn('mx-auto max-w-[1200px]', innerClassName)}>{children}</div>
      ) : (
        children
      )}
    </section>
  )
}
