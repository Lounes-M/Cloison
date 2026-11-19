import { Button } from '@/components/ui/Button'
import { Photo } from '@/components/ui/Photo'
import * as en from '@/lib/content/en/home'
import * as fr from '@/lib/content/home'
import { choisir, lien, type Langue } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Les trois espaces, en cartes qui s'empilent au defilement : chacune colle
 * un peu plus bas que la precedente et vient la recouvrir.
 */
const habillages = [
  {
    carte: 'bg-sun text-ink',
    titre: 'text-cobalt',
  },
  {
    carte: 'bg-cobalt text-white',
    titre: 'text-sun',
  },
  {
    carte: 'bg-ink text-white',
    titre: 'text-white',
  },
] as const

/** Ou tombe le sujet de chaque photo, la carte coupant a gauche et en haut. */
const cadrages: Record<(typeof fr.spaces)[number]['id'], string> = {
  locataire: 'object-[45%_50%]',
  garant: 'object-[55%_50%]',
  agence: 'object-[80%_50%]',
}

export function Espaces({ langue = 'fr' }: { langue?: Langue }) {
  const { espacesAccueil, spaces } = choisir(langue, fr, en)
  return (
    <section
      aria-label={espacesAccueil.aria}
      className="bg-cream gouttiere pt-[11.25rem] pb-[11.25rem] max-[767px]:py-[3.75rem]"
    >
      <ol className="conteneur">
        {spaces.map((space, index) => {
          const habillage = habillages[index % habillages.length]!
          const cible = espacesAccueil.liens[index % espacesAccueil.liens.length]!
          return (
            <li
              key={space.id}
              className="md:sticky"
              style={{ top: `calc(var(--entete-total) + ${1.5 + index * 2.5}rem)` }}
            >
              <article
                className={cn(
                  'rounded-carte group mb-[1.5rem] grid overflow-hidden md:min-h-[37.6rem] md:grid-cols-[minmax(0,40.75rem)_minmax(16rem,1fr)]',
                  habillage.carte,
                )}
              >
                <div className="flex flex-col px-[2.5rem] pt-[4.25rem] pb-[3rem] max-[479px]:px-6 max-[479px]:pt-8">
                  <p className="texte-42 opacity-80">
                    {espacesAccueil.etape} {space.step}
                  </p>
                  <h3 className={cn('texte-42 mt-[1.4rem]', habillage.titre)}>{space.title}</h3>
                  <p className="mt-[1.1rem] max-w-[35.6rem]">{space.body}</p>
                  <p className="texte-14 mt-[0.75rem] font-medium">
                    {space.footnote.left}
                    {'right' in space.footnote && ` · ${space.footnote.right}`}
                  </p>
                  <div className="mt-[2rem]">
                    <Button href={lien(langue, cible.href)} tone="paper">
                      {cible.libelle}
                    </Button>
                  </div>
                </div>
                <Photo
                  src={`/accueil/espace-${space.id}.jpg`}
                  sizes="(min-width: 768px) 640px, 100vw"
                  cadrage={cadrages[space.id]}
                  className="photo-vivante min-h-64 md:mt-[4.25rem] md:rounded-tl-[2rem] md:[clip-path:polygon(8%_0,100%_14%,100%_100%,0_100%)]"
                />
              </article>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
