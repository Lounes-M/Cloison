import { Button } from '@/components/ui/Button'
import { Photo } from '@/components/ui/Photo'
import { espacesAccueil, spaces } from '@/lib/content/home'
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
const cadrages: Record<(typeof spaces)[number]['id'], string> = {
  locataire: 'object-[45%_50%]',
  garant: 'object-[55%_50%]',
  agence: 'object-[80%_50%]',
}

export function Espaces() {
  return (
    <section aria-label={espacesAccueil.aria} className="bg-cream px-4 pb-24 md:px-6 md:pb-36">
      <ol className="mx-auto max-w-[1280px]">
        {spaces.map((space, index) => {
          const habillage = habillages[index % habillages.length]!
          const lien = espacesAccueil.liens[index % espacesAccueil.liens.length]!
          return (
            <li
              key={space.id}
              className="md:sticky"
              style={{ top: `calc(var(--entete-total) + ${1 + index * 3}rem)` }}
            >
              <article
                className={cn(
                  'rounded-carte mb-8 grid min-h-[70vh] overflow-hidden md:grid-cols-2',
                  habillage.carte,
                )}
              >
                <div className="flex flex-col justify-center p-8 md:p-14">
                  <p className="font-display text-3xl opacity-60 md:text-4xl">
                    {espacesAccueil.etape} {space.step}
                  </p>
                  <h3
                    className={cn(
                      'font-display mt-2 text-[clamp(2rem,4vw,3.25rem)] leading-tight',
                      habillage.titre,
                    )}
                  >
                    {space.title}
                  </h3>
                  <p className="mt-5 max-w-[42ch] text-base leading-relaxed md:text-lg">
                    {space.body}
                  </p>
                  <p className="mt-4 text-sm font-medium opacity-80">
                    {space.footnote.left}
                    {'right' in space.footnote && ` · ${space.footnote.right}`}
                  </p>
                  <div className="mt-8">
                    <Button href={lien.href} tone="paper">
                      {lien.libelle}
                    </Button>
                  </div>
                </div>
                <Photo
                  src={`/accueil/espace-${space.id}.jpg`}
                  sizes="(min-width: 768px) 640px, 100vw"
                  cadrage={cadrages[space.id]}
                  className="min-h-64 md:mt-10 md:-mr-6 md:-mb-6 md:rounded-tl-[3rem] md:[clip-path:polygon(8%_0,100%_14%,100%_100%,0_100%)]"
                />
              </article>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
