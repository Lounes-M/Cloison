import Link from 'next/link'
import type { Route } from 'next'
import { journal } from '@/lib/content/journal'
export function NavigationJournal({
  chemin,
  suivant,
  ancien,
}: {
  chemin: '/garant' | `/espace/dossiers/${string}`
  suivant: string | null
  ancien: boolean
}) {
  if (!suivant && !ancien) return null
  return (
    <nav aria-label={journal.navigation} className="mt-5 flex flex-wrap gap-4 text-sm font-bold">
      {ancien ? (
        <Link
          prefetch={false}
          className="text-cobalt inline-flex min-h-10 items-center underline underline-offset-4"
          href={`${chemin}#journal` as Route}
        >
          {journal.recents}
        </Link>
      ) : null}
      {suivant ? (
        <Link
          prefetch={false}
          className="text-cobalt inline-flex min-h-10 items-center underline underline-offset-4"
          href={`${chemin}?avant=${suivant}#journal` as Route}
        >
          {journal.anciens}
        </Link>
      ) : null}
    </nav>
  )
}
