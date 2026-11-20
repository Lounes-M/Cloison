import Link from 'next/link'
import type { Route } from 'next'
import { journal as journalFr } from '@/lib/content/journal'
import { journal as journalEn } from '@/lib/content/en/journal'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'
export async function NavigationJournal({
  chemin,
  suivant,
  ancien,
}: {
  chemin: '/garant' | `/espace/dossiers/${string}`
  suivant: string | null
  ancien: boolean
}) {
  const langue = await langueEspace()
  const journal = choisir(langue, journalFr, journalEn)

  if (!suivant && !ancien) return null
  return (
    <nav aria-label={journal.navigation} className="mt-5 flex flex-wrap gap-4 text-sm font-bold">
      {ancien ? (
        <Link prefetch={false} className="lien-espace" href={`${chemin}#journal` as Route}>
          {journal.recents}
        </Link>
      ) : null}
      {suivant ? (
        <Link
          prefetch={false}
          className="lien-espace"
          href={`${chemin}?avant=${suivant}#journal` as Route}
        >
          {journal.anciens}
        </Link>
      ) : null}
    </nav>
  )
}
