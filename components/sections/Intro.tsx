import { Reveal } from '@/components/ui/Reveal'
import { Photo } from '@/components/ui/Photo'
import { problem, product } from '@/lib/content/home'
import { cn } from '@/lib/utils'

/** Les photos qui passent autour du titre : position et taille. */
const photos = [
  { nom: 'intro-1', classe: 'left-[2%] top-[4%] w-[17%]' },
  { nom: 'intro-2', classe: 'left-[26%] top-[10%] w-[17%]' },
  { nom: 'intro-3', classe: 'right-[7%] top-[6%] w-[17%]' },
  { nom: 'intro-4', classe: 'right-[7%] top-[38%] w-[17%]' },
  { nom: 'intro-5', classe: 'left-[8%] top-[46%] w-[17%]' },
  { nom: 'intro-6', classe: 'left-[18%] top-[78%] w-[17%]' },
  { nom: 'intro-7', classe: 'right-[18%] top-[70%] w-[17%]' },
] as const

/**
 * Section rose : le titre reste colle au milieu de l'ecran pendant que les
 * photos defilent autour, puis le second bloc prend le relais. Le bas de la
 * section s'arrondit sur la suivante.
 */
export function Intro() {
  return (
    <section className="bg-sun rounded-b-carte relative z-10 overflow-clip px-4 md:px-6">
      <div className="relative mx-auto max-w-[1440px] md:min-h-[190vh]">
        {photos.map((photo) => (
          <Photo
            key={photo.nom}
            src={`/accueil/${photo.nom}.jpg`}
            sizes="(min-width: 768px) 17vw, 1px"
            className={cn('absolute hidden aspect-square rounded-3xl md:block', photo.classe)}
          />
        ))}

        <div className="relative py-24 text-center md:sticky md:top-[calc(var(--entete-total)+8vh)] md:py-0 md:pt-[28vh]">
          <Reveal>
            <h2 className="font-display text-cobalt mx-auto max-w-[16ch] text-[clamp(2.5rem,6vw,6.5rem)] leading-[1.05]">
              {product.headline[0]} {product.headline[1]}
            </h2>
            <p className="font-display mx-auto mt-6 max-w-[34ch] text-xl md:text-3xl">
              {product.intro}
            </p>
          </Reveal>
        </div>
      </div>

      <div className="relative mx-auto max-w-[44rem] pb-28 text-center md:pb-40">
        <Reveal>
          <h3 className="font-display text-2xl md:text-4xl">{problem.title}</h3>
          <p className="mt-6 text-base leading-relaxed md:text-lg">{problem.body}</p>
          <p className="mt-4 text-base leading-relaxed font-semibold md:text-lg">
            {problem.punchline}
          </p>
        </Reveal>
      </div>
    </section>
  )
}
