import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import { problem } from '@/lib/content/home'
import { cn } from '@/lib/utils'

/**
 * Les photos qui passent de part et d'autre du titre : ancrees aux bords de
 * la section, pour ne jamais croiser le texte du milieu.
 */
const photos = [
  { nom: 'intro-1', classe: 'left-[3.3rem] top-[2rem] -rotate-3' },
  { nom: 'intro-3', classe: 'right-[6.5rem] top-[9rem] rotate-2' },
  { nom: 'intro-2', classe: 'left-[7.5rem] top-[36rem] rotate-2' },
  { nom: 'intro-4', classe: 'right-[2.5rem] top-[50rem] -rotate-2' },
  { nom: 'intro-5', classe: 'left-[2.5rem] top-[72rem] -rotate-2' },
  { nom: 'intro-7', classe: 'right-[7rem] top-[90rem] rotate-3' },
  { nom: 'intro-6', classe: 'left-[8rem] top-[108rem] rotate-1' },
] as const

/**
 * Section rose : le titre reste colle au milieu de l'ecran pendant que les
 * photos defilent autour, puis le second bloc prend le relais. Le bas de la
 * section s'arrondit sur la suivante.
 */
export function Intro() {
  return (
    <section className="bg-sun rounded-b-carte relative z-10 overflow-clip">
      <div className="relative mx-auto max-w-[95rem] lg:min-h-[150rem]">
        {photos.map((photo) => (
          <Photo
            key={photo.nom}
            src={`/accueil/${photo.nom}.jpg`}
            sizes="(min-width: 1024px) 17vw, 1px"
            className={cn(
              'absolute hidden h-[16.25rem] w-[16.4rem] rounded-[1.5rem] shadow-[0_1.5rem_3rem_-1.5rem_rgb(0_0_0/0.35)] lg:block',
              photo.classe,
            )}
          />
        ))}

        <div className="gouttiere relative py-[3.75rem] text-center lg:sticky lg:top-[calc(var(--entete-total)+12rem)] lg:py-0 lg:pt-[30rem]">
          <Reveal>
            <h2 className="titre-84 text-cobalt mx-auto max-w-[44rem]">{problem.titre}</h2>
            <p className="texte-32 mx-auto mt-[1.5rem] max-w-[42rem]">{problem.sousTitre}</p>
            <p className="mx-auto mt-[1rem] max-w-[40rem]">{problem.body}</p>
          </Reveal>
        </div>
      </div>

      <div className="gouttiere relative pt-[6rem] pb-[9.3rem] text-center max-[1023px]:pt-0 max-[1023px]:pb-[3.75rem]">
        <Reveal className="mx-auto max-w-[42rem]">
          <h3 className="texte-32">{problem.suite.titre}</h3>
          <p className="mt-[1rem]">{problem.suite.texte}</p>
        </Reveal>
      </div>
    </section>
  )
}
