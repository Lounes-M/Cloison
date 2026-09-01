import { marqueeItems } from '@/lib/content/home'

/**
 * Bandeau défilant incliné.
 *
 * Deux `overflow-hidden` imbriqués, et ils servent chacun à quelque chose :
 * l'extérieur rattrape la largeur que la rotation + le `scale` font déborder
 * du viewport (sinon la page scrolle horizontalement de quelques pixels),
 * l'intérieur découpe la bande de texte.
 *
 * La liste est dupliquée et l'animation translate de -50 % : la boucle est
 * ainsi parfaitement continue quel que soit le nombre d'items.
 */
export function Marquee() {
  const items = [...marqueeItems, ...marqueeItems]

  return (
    <div aria-hidden className="overflow-hidden">
      <div className="border-ink bg-cobalt scale-[1.02] -rotate-1 overflow-hidden border-y-[3px] py-3.5 whitespace-nowrap">
        <div className="animate-marquee font-display flex w-max text-base text-white uppercase">
          {items.map((item, index) => (
            <span key={`${item}-${index}`} className="flex items-center gap-10 pr-10">
              {item}
              <span className="text-sun">★</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
