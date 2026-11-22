import { Defilement } from '@/components/ui/Defilement'
import { Reveal } from '@/components/ui/Reveal'
import * as en from '@/lib/content/en/home'
import * as fr from '@/lib/content/home'
import { choisir, type Langue } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Qui paie quoi : une ligne par personne. Au centre, le prix dans un pan
 * incline, a l'endroit ou la charte pose une photo ; a droite, le detail.
 */
export function Tarifs({ langue = 'fr' }: { langue?: Langue }) {
  const { pricing } = choisir(langue, fr, en)
  const lignes = [
    ...pricing.plans.map((plan) => ({ ...plan, regle: undefined })),
    { ...pricing.goldenRule, regle: pricing.goldenRule.tag },
  ]
  const pans = ['bg-flame text-ink', 'bg-sun text-ink', 'bg-cream text-cobalt']

  return (
    <section
      id="tarifs"
      className="bg-cobalt rounded-t-carte gouttiere relative z-10 pt-[11.25rem] pb-[6.2rem] text-white max-[767px]:pt-[4.8rem] max-[767px]:pb-[3rem]"
    >
      <div className="conteneur">
        <Reveal>
          <h2 className="titre-84">
            {pricing.headline[0]}
            <br />
            <span className="text-sun">{pricing.headline[1]}</span>
          </h2>
        </Reveal>

        <ul className="mt-[2.9rem]">
          {lignes.map((ligne, index) => (
            <li key={ligne.audience} className="border-b border-[#4e8478]">
              <Reveal className="grid gap-6 overflow-hidden pt-[4.85rem] max-[767px]:py-8 md:min-h-[18.6rem] md:grid-cols-[18.45rem_25.5rem_1fr] md:gap-0 md:gap-x-[4.4rem]">
                <h3 className="texte-28 text-sun md:pt-[1.5rem]">
                  {ligne.audience}
                  {ligne.regle && (
                    <span className="texte-14 mt-2 block font-normal text-white">
                      {ligne.regle}
                    </span>
                  )}
                </h3>
                <Defilement mode="entree" className="flex self-end">
                  <p
                    className={cn(
                      'montee texte-60 flex min-h-[11rem] w-full items-end rounded-t-[1.5rem] px-[1.75rem] pt-[3.5rem] pb-[1.5rem] [clip-path:polygon(0_22%,100%_0,100%_100%,0_100%)] max-[767px]:min-h-[8rem] max-[767px]:rounded-[1.5rem] max-[767px]:pt-[2.5rem] max-[479px]:text-[2.25rem]',
                      pans[index % pans.length],
                    )}
                  >
                    {ligne.price}
                  </p>
                </Defilement>
                <p className="texte-18 text-white/90 md:max-w-[26rem] md:pt-[1.5rem]">
                  {ligne.detail}
                </p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
