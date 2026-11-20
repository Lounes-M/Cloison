import { Repere } from '@/components/ui/Repere'
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
      <Repere as="p" ton={ton} className="mb-3 text-[13px] tracking-wide uppercase">
        {etiquette}
      </Repere>
      <h1 className="font-display text-[clamp(1.25rem,6.25vw,2rem)] leading-tight break-words">
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
