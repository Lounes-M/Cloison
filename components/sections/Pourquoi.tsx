import { Button } from '@/components/ui/Button'
import { Icone, type NomIcone } from '@/components/ui/Icone'
import { Reveal } from '@/components/ui/Reveal'
import { vision, whyNow } from '@/lib/content/home'
import { cn } from '@/lib/utils'

/** Une carte par cas d'usage : couleurs, inclinaison, decalage, icone. */
const cartes: {
  classe: string
  titre: string
  icone: NomIcone
  inclinaison: number
  decalage: string
}[] = [
  {
    classe: 'bg-cobalt text-sun',
    titre: 'text-sun',
    icone: 'cadenas',
    inclinaison: -8,
    decalage: 'lg:mt-0',
  },
  {
    classe: 'bg-sun text-cobalt',
    titre: 'text-cobalt',
    icone: 'acte',
    inclinaison: 0,
    decalage: 'lg:mt-[3.3rem]',
  },
  {
    classe: 'bg-ink text-sun',
    titre: 'text-sun',
    icone: 'fichier',
    inclinaison: -4,
    decalage: 'lg:mt-[1.8rem]',
  },
  {
    classe: 'bg-flame text-ink',
    titre: 'text-ink',
    icone: 'etoile',
    inclinaison: 6,
    decalage: 'lg:mt-[0.6rem]',
  },
]

/**
 * Pourquoi maintenant, puis l'horizon : au-dela de la location, les autres
 * engagements qu'un proche prend pour quelqu'un. Le nom du produit passe en
 * filigrane geant derriere les cartes.
 */
export function Pourquoi() {
  return (
    <section className="bg-cream gouttiere section-espace overflow-hidden">
      <div className="conteneur grid items-center gap-8 md:grid-cols-[1fr_39.4rem]">
        <Reveal>
          <h2 className="titre-84">{whyNow.eyebrow}</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p>{whyNow.body}</p>
          <p className="mt-[0.5rem] font-semibold">{whyNow.emphasis}</p>
        </Reveal>
      </div>

      <div className="conteneur relative mt-[7rem] max-[767px]:mt-14">
        <p
          aria-hidden
          data-mot={vision.headline[2]}
          className="texte-128 text-cobalt/20 pointer-events-none absolute inset-x-0 -top-[0.5em] text-center whitespace-nowrap before:content-[attr(data-mot)]"
        />
        <ul className="relative grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-0">
          {vision.useCases.map((useCase, index) => {
            const carte = cartes[index % cartes.length]!
            return (
              <li key={useCase.label} className={carte.decalage}>
                <Reveal delay={index * 0.08} tilt={carte.inclinaison}>
                  <article
                    className={cn(
                      'lift flex min-h-[22rem] flex-col rounded-[1.5rem] p-[1.5rem] sm:min-h-[29rem] lg:-mx-[0.75rem] lg:p-[2.3rem]',
                      carte.classe,
                    )}
                  >
                    <h3 className={cn('texte-24', carte.titre)}>{useCase.label}</h3>
                    <Icone nom={carte.icone} className="my-auto size-[4.5rem] self-center" />
                    <p className="texte-18 border-t border-current pt-[1.1rem]">{useCase.texte}</p>
                  </article>
                </Reveal>
              </li>
            )
          })}
        </ul>
      </div>

      <Reveal className="mx-auto mt-[7rem] max-w-[56rem] text-center max-[767px]:mt-14">
        <p className="texte-32">
          {vision.headline[0]} {vision.headline[1]}{' '}
          <span className="text-flame-texte">{vision.headline[2]}</span>
        </p>
        <p className="mt-[1.25rem]">{vision.body}</p>
        <div className="mt-[2.5rem] flex justify-center">
          <Button href="/demarrer" tone="paper">
            {vision.cta}
          </Button>
        </div>
      </Reveal>
    </section>
  )
}
