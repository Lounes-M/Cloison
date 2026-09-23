import { cn } from '@/lib/utils'
export function EnteteEspace({
  titre,
  etiquette,
  children,
  ton = 'sky',
}: {
  titre: React.ReactNode
  etiquette: string
  children?: React.ReactNode
  ton?: 'sky' | 'mint' | 'sun'
}) {
  return (
    <header className="entete-espace border-ink/15 mb-6 border-b pb-6">
      <p
        className={cn(
          'mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold tracking-wide',
          { sky: 'bg-sky', mint: 'bg-mint', sun: 'bg-sun' }[ton],
        )}
      >
        {etiquette}
      </p>
      <h1 className="font-display text-[clamp(1.25rem,6.25vw,2rem)] leading-tight break-words uppercase">
        {titre}
      </h1>
      {children ? (
        <div className="text-muted mt-3 max-w-2xl text-sm leading-relaxed sm:text-base">
          {children}
        </div>
      ) : null}
    </header>
  )
}
