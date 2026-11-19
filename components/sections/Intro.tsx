import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import { problem } from '@/lib/content/home'
import { cn } from '@/lib/utils'

/**
 * Les photos qui passent autour du titre : position dans la section, en rem,
 * comme la composition de reference a 1440 px.
 */
const photos = [
  { nom: 'intro-1', classe: 'left-[3.3rem] top-0' },
  { nom: 'intro-2', classe: 'left-[25.6rem] top-[9.25rem]' },
  { nom: 'intro-3', classe: 'left-[68.7rem] top-[7.75rem]' },
  { nom: 'intro-4', classe: 'left-[72.6rem] top-[47rem]' },
  { nom: 'intro-5', classe: 'left-[9.2rem] top-[57.4rem]' },
  { nom: 'intro-6', classe: 'left-[19.7rem] top-[93.6rem]' },
  { nom: 'intro-7', classe: 'left-[58.9rem] top-[87.75rem]' },
] as const

/**
 * Section rose : le titre reste colle au milieu de l'ecran pendant que les
 * photos defilent autour, puis le second bloc prend le relais. Le bas de la
 * section s'arrondit sur la suivante.
 */
export function Intro() {
  return (
    <section className="bg-sun rounded-b-carte relative z-10 overflow-clip">
      <div className="relative mx-auto max-w-[95rem] md:min-h-[150rem]">
        {photos.map((photo) => (
          <Photo
            key={photo.nom}
            src={`/accueil/${photo.nom}.jpg`}
            sizes="(min-width: 768px) 17vw, 1px"
            className={cn(
              'absolute hidden h-[16.25rem] w-[16.4rem] rounded-[1.5rem] md:block',
              photo.classe,
            )}
          />
        ))}

        <div className="gouttiere relative py-[3.75rem] text-center md:sticky md:top-[calc(var(--entete-total)+12rem)] md:py-0 md:pt-[30rem]">
          <Reveal>
            <h2 className="titre-84 text-cobalt mx-auto max-w-[58rem]">{problem.titre}</h2>
            <p className="texte-32 mx-auto mt-[1.5rem] max-w-[42rem]">{problem.sousTitre}</p>
            <p className="mx-auto mt-[1rem] max-w-[42rem]">{problem.body}</p>
          </Reveal>
        </div>
      </div>

      <div className="gouttiere relative pt-[6rem] pb-[9.3rem] text-center max-[767px]:pt-0 max-[767px]:pb-[3.75rem]">
        <Reveal className="mx-auto max-w-[42rem]">
          <h3 className="texte-32">{problem.suite.titre}</h3>
          <p className="mt-[1rem]">{problem.suite.texte}</p>
        </Reveal>
      </div>
    </section>
  )
}
