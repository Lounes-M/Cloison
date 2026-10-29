import { frise } from '@/lib/content/frise'
import type { Etape } from '@/lib/dossiers/frise'
import { cn } from '@/lib/utils'

const pastilles = {
  fait: 'bg-mint',
  encours: 'bg-sun',
  avenir: 'bg-paper',
  arrete: 'bg-flame text-ink',
} as const

/** Une liste ordonnee : l'ordre et l'etat se lisent sans la couleur. */
export function FriseAvancement({ titre, etapes }: { titre: string; etapes: Etape[] }) {
  return (
    <section aria-labelledby="frise-titre" className="panneau-espace mt-6">
      <h2 id="frise-titre" className="text-xl font-bold">
        {titre}
      </h2>
      <ol className="mt-4 flex flex-col gap-3">
        {etapes.map((etape, i) => (
          <li
            key={etape.titre}
            aria-current={etape.etat === 'encours' ? 'step' : undefined}
            className="flex items-center gap-3 text-[15px]"
          >
            <span
              aria-hidden="true"
              className={cn(
                'border-ink flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold',
                pastilles[etape.etat],
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn('font-semibold', etape.etat === 'avenir' && 'text-muted font-medium')}
            >
              {etape.titre}
              <span className="text-muted text-[13px] font-medium">
                {' '}
                ({frise.etats[etape.etat]})
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
