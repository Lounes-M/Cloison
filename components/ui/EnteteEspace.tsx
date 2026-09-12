import { Icone } from '@/components/ui/Icone'
export function EnteteEspace({
  titre,
  etiquette,
  children,
}: {
  titre: React.ReactNode
  etiquette: string
  children?: React.ReactNode
}) {
  return (
    <header className="entete-espace bg-sky outlined shadow-brut rounded-brut-xl relative mb-8 p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="bg-sun outlined shadow-brut-xs absolute -top-3 right-5 grid size-10 rotate-6 place-items-center rounded-xl"
      >
        <Icone nom="asterisque" className="size-6" />
      </div>
      <p className="mb-4 pr-8 text-xs font-bold tracking-widest uppercase">{etiquette}</p>
      <h1 className="font-display text-[clamp(1.25rem,6.25vw,3rem)] leading-tight break-words uppercase sm:text-[clamp(1.7rem,4vw,3rem)]">
        {titre}
      </h1>
      {children ? (
        <div className="mt-4 max-w-2xl text-sm leading-relaxed font-medium sm:text-base">
          {children}
        </div>
      ) : null}
    </header>
  )
}
