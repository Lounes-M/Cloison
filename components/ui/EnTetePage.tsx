import { cn } from '@/lib/utils'

type EnTetePageProps = {
  /** Petite ligne en capitales au-dessus du titre. */
  surtitre?: string
  /** Le titre : une chaine, ou des morceaux dont ceux en `accent` passent en orange. */
  titre: React.ReactNode
  sousTitre?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/**
 * Premiere section des pages interieures du site public : fond rose traverse
 * de rayons creme, tout centre. Elle passe sous l'en-tete fixe.
 */
export function EnTetePage({ surtitre, titre, sousTitre, children, className }: EnTetePageProps) {
  return (
    <section
      className={cn(
        'passe-sous-entete bg-sun relative overflow-hidden px-4 pt-[calc(var(--entete-total)+3rem)] pb-20 text-center md:px-6 md:pt-[calc(var(--entete-total)+4rem)] md:pb-28',
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[repeating-conic-gradient(from_0deg_at_50%_55%,var(--color-cream)_0deg_14deg,transparent_14deg_40deg)] opacity-70"
      />
      <div className="relative mx-auto max-w-[64rem]">
        {surtitre && (
          <p className="animate-fade-up text-xs font-medium tracking-[0.06em] uppercase md:text-sm">
            {surtitre}
          </p>
        )}
        <h1 className="font-display animate-fade-up mt-4 text-[clamp(2.25rem,5.5vw,5.25rem)] leading-[1.08] text-balance [animation-delay:0.1s]">
          {titre}
        </h1>
        {sousTitre && (
          <div className="animate-fade-up mx-auto mt-8 max-w-[44rem] text-base leading-relaxed font-medium [animation-delay:0.2s] md:text-xl">
            {sousTitre}
          </div>
        )}
        {children && <div className="animate-fade-up mt-10 [animation-delay:0.3s]">{children}</div>}
      </div>
    </section>
  )
}

/** Mot d'accent dans un titre : orange lisible. */
export function Accent({ children }: { children: React.ReactNode }) {
  return <span className="text-flame-texte">{children}</span>
}
