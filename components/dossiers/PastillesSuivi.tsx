import { tableau } from '@/lib/content/espace'
import type { PastilleSuivi } from '@/lib/agences/inactivite'

const tons: Record<PastilleSuivi, string> = {
  remplacement: 'bg-sun',
  sans_nouvelles: 'bg-paper',
}

/** Les signaux de suivi d'un dossier, sous son statut. */
export function PastillesSuivi({ pastilles }: { pastilles: PastilleSuivi[] }) {
  if (!pastilles.length) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {pastilles.map((p) => (
        <li
          key={p}
          className={`outlined inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tons[p]}`}
        >
          {tableau.pastilles[p]}
        </li>
      ))}
    </ul>
  )
}
