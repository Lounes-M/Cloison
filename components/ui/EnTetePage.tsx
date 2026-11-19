import { cn } from '@/lib/utils'

type EnTetePageProps = {
  /** Petite ligne en capitales au-dessus du titre. */
  surtitre?: string
  /** Le titre : une chaine, ou des morceaux dont ceux en `accent` passent en orange. */
  titre: React.ReactNode
  sousTitre?: React.ReactNode
  children?: React.ReactNode
  /** Grande photo arrondie sous le titre, comme les pages de la reference. */
  visuel?: React.ReactNode
  className?: string
}

/**
 * Premiere section des pages interieures du site public : fond rose traverse
 * de rayons creme, tout centre. Elle passe sous l'en-tete fixe.
 */
export function EnTetePage({
  surtitre,
  titre,
  sousTitre,
  children,
  visuel,
  className,
}: EnTetePageProps) {
  return (
    <section
      className={cn(
        'passe-sous-entete bg-sun gouttiere relative overflow-hidden pt-[calc(var(--entete-barre)+9.25rem)] pb-[7.5rem] text-center max-[479px]:pt-[calc(var(--entete-total)+3rem)] max-[479px]:pb-[3.75rem]',
        visuel && 'pb-0 max-[479px]:pb-0',
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[repeating-conic-gradient(from_0deg_at_50%_55%,var(--color-cream)_0deg_14deg,transparent_14deg_40deg)] opacity-70"
      />
      <div className="relative mx-auto max-w-[54.75rem]">
        {surtitre && <p className="animate-fade-up texte-14 font-semibold uppercase">{surtitre}</p>}
        <h1 className="titre-84 animate-fade-up mt-[1rem] text-balance [animation-delay:0.1s]">
          {titre}
        </h1>
        {sousTitre && (
          <div className="animate-fade-up texte-24 mt-[2rem] [animation-delay:0.2s] max-[479px]:mt-[1.25rem] max-[479px]:leading-[1.4]">
            {sousTitre}
          </div>
        )}
        {children && (
          <div className="animate-fade-up mt-[2.5rem] [animation-delay:0.3s]">{children}</div>
        )}
      </div>
      {visuel && (
        <div
          aria-hidden
          className="bg-cream absolute inset-x-0 bottom-0 h-[16rem] max-[479px]:h-[6rem]"
        />
      )}
      {visuel && (
        <div className="conteneur animate-fade-up relative mt-[4rem] [animation-delay:0.3s]">
          {visuel}
        </div>
      )}
    </section>
  )
}

/** Mot d'accent dans un titre : orange lisible. */
export function Accent({ children }: { children: React.ReactNode }) {
  return <span className="text-flame-texte">{children}</span>
}
