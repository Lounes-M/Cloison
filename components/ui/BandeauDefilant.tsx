import { CommandeMouvement } from '@/components/ui/CommandeMouvement'
import type { Langue } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Le bandeau vert defilant : liste quadruplee, translation de -50 %, boucle
 * continue. Le texte est un decor, cache aux lecteurs d'ecran ; la commande
 * de pause, elle, reste atteignable, posee au bout du bandeau.
 */
export function BandeauDefilant({
  items,
  langue,
  className,
}: {
  items: readonly string[]
  langue: Langue
  className?: string
}) {
  const boucle = [...items, ...items, ...items, ...items]
  return (
    <div className={cn('bg-cobalt relative h-[3.9rem] text-white', className)}>
      <div aria-hidden className="flex h-full items-center overflow-hidden whitespace-nowrap">
        <div className="animate-marquee texte-16 flex w-max">
          {boucle.map((item, index) => (
            <span key={`${item}-${index}`} className="flex items-center gap-[2rem] pr-[2rem]">
              <span className="border-y-[5px] border-r-[8px] border-y-transparent border-r-white" />
              {item}
            </span>
          ))}
        </div>
      </div>
      <CommandeMouvement
        langue={langue}
        className="bg-cobalt absolute inset-y-0 right-0 my-auto mr-[0.5rem] rounded-full"
      />
    </div>
  )
}
