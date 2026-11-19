import { Button } from '@/components/ui/Button'
import { Icone, type NomIcone } from '@/components/ui/Icone'
import { Reveal } from '@/components/ui/Reveal'
import { vision, whyNow } from '@/lib/content/home'
import { cn } from '@/lib/utils'

/** Une carte par cas d'usage : couleur, inclinaison, icone. */
const cartes: { classe: string; titre: string; icone: NomIcone; inclinaison: number }[] = [
  { classe: 'bg-cobalt text-white', titre: 'text-sun', icone: 'cadenas', inclinaison: -8 },
  { classe: 'bg-sun text-ink', titre: 'text-cobalt', icone: 'acte', inclinaison: 0 },
  { classe: 'bg-ink text-white', titre: 'text-sun', icone: 'fichier', inclinaison: -4 },
  { classe: 'bg-flame text-ink', titre: 'text-ink', icone: 'etoile', inclinaison: 6 },
]

/**
 * Pourquoi maintenant, puis l'horizon : au-dela de la location, les autres
 * engagements qu'un proche prend pour quelqu'un. Le nom du produit passe en
 * filigrane geant derriere les cartes.
 */
export function Pourquoi() {
  return (
    <section className="bg-cream overflow-hidden px-4 py-24 md:px-6 md:py-36">
      <div className="mx-auto grid max-w-[1280px] items-center gap-8 md:grid-cols-2">
        <Reveal>
          <h2 className="font-display text-[clamp(2.5rem,6vw,6.5rem)] leading-[1.05]">
            {whyNow.eyebrow}
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="text-base leading-relaxed md:text-lg">{whyNow.body}</p>
          <p className="mt-3 text-base leading-relaxed font-semibold md:text-lg">
            {whyNow.emphasis}
          </p>
        </Reveal>
      </div>

      <div className="relative mx-auto mt-20 max-w-[1280px] md:mt-28">
        <p
          aria-hidden
          data-mot={vision.headline[2]}
          className="font-display text-cobalt/20 pointer-events-none absolute inset-x-0 -top-[0.45em] text-center text-[clamp(4rem,10vw,10rem)] leading-none whitespace-nowrap before:content-[attr(data-mot)]"
        />
        <ul className="relative grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-0">
          {vision.useCases.map((useCase, index) => {
            const carte = cartes[index % cartes.length]!
            return (
              <li key={useCase.label}>
                <Reveal delay={index * 0.08} tilt={carte.inclinaison}>
                  <article
                    className={cn(
                      'lift flex min-h-52 flex-col rounded-[1.75rem] p-6 sm:aspect-[7/10] sm:p-7 lg:-mx-2',
                      carte.classe,
                    )}
                  >
                    <h3
                      className={cn('font-display text-lg leading-tight sm:text-2xl', carte.titre)}
                    >
                      {useCase.label}
                    </h3>
                    <Icone nom={carte.icone} className="mt-auto size-14" />
                    <span className="mt-8 block border-t border-current opacity-30" />
                  </article>
                </Reveal>
              </li>
            )
          })}
        </ul>
      </div>

      <Reveal className="mx-auto mt-24 max-w-[48rem] text-center">
        <p className="font-display text-2xl leading-snug md:text-4xl">
          {vision.headline[0]} {vision.headline[1]}{' '}
          <span className="text-flame-texte">{vision.headline[2]}</span>
        </p>
        <p className="mt-6 text-base leading-relaxed md:text-lg">{vision.body}</p>
        <div className="mt-10 flex justify-center">
          <Button href="/demarrer" tone="paper">
            {vision.cta}
          </Button>
        </div>
      </Reveal>
    </section>
  )
}
