import { Reveal } from '@/components/ui/Reveal'
import { pricing } from '@/lib/content/home'
import { cn } from '@/lib/utils'

/**
 * Qui paie quoi : une ligne par personne. Au centre, le prix dans un pan
 * incline, a l'endroit ou la charte pose une photo ; a droite, le detail.
 */
export function Tarifs() {
  const lignes = [
    ...pricing.plans.map((plan) => ({ ...plan, regle: undefined })),
    { ...pricing.goldenRule, regle: pricing.goldenRule.tag },
  ]
  const pans = ['bg-flame text-ink', 'bg-sun text-ink', 'bg-cream text-cobalt']

  return (
    <section
      id="tarifs"
      className="bg-cobalt rounded-carte relative z-10 px-4 py-24 text-white md:px-6 md:py-36"
    >
      <div className="mx-auto max-w-[1280px]">
        <Reveal>
          <h2 className="font-display mx-auto max-w-[64rem] text-[clamp(2.5rem,6vw,6.5rem)] leading-[1.05] md:pl-[10%]">
            {pricing.headline[0]}
            <br />
            <span className="text-sun">{pricing.headline[1]}</span>
          </h2>
        </Reveal>

        <ul className="mt-20">
          {lignes.map((ligne, index) => (
            <li key={ligne.audience} className="border-t border-white/15 first:border-t-0">
              <Reveal className="grid items-center gap-6 py-10 md:grid-cols-[1fr_1.2fr_1.3fr] md:gap-12">
                <h3 className="font-display text-sun text-2xl md:text-3xl">
                  {ligne.audience}
                  {ligne.regle && (
                    <span className="mt-2 block text-sm font-medium text-white/70">
                      {ligne.regle}
                    </span>
                  )}
                </h3>
                <p
                  className={cn(
                    'font-display flex min-h-44 items-end rounded-3xl px-7 pt-14 pb-7 text-[clamp(1.75rem,3vw,2.75rem)] leading-tight [clip-path:polygon(0_22%,100%_0,100%_100%,0_100%)]',
                    pans[index % pans.length],
                  )}
                >
                  {ligne.price}
                </p>
                <p className="text-base leading-relaxed opacity-90">{ligne.detail}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
