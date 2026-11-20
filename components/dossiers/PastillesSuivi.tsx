import { Repere, type TonRepere } from '@/components/ui/Repere'
import { tableau as tableauFr } from '@/lib/content/espace'
import type { PastilleSuivi } from '@/lib/agences/inactivite'
import { tableau as tableauEn } from '@/lib/content/en/espace'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

const tons: Record<PastilleSuivi, TonRepere> = {
  remplacement: 'flame',
  sans_nouvelles: 'paper',
  relances_epuisees: 'paper',
}

/** Les signaux de suivi d'un dossier, sous son statut. */
export async function PastillesSuivi({ pastilles }: { pastilles: PastilleSuivi[] }) {
  const langue = await langueEspace()
  const tableau = choisir(langue, tableauFr, tableauEn)

  if (!pastilles.length) return null
  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {pastilles.map((p) => (
        <Repere as="li" key={p} ton={tons[p]} className="text-muted text-[12px]">
          {tableau.pastilles[p]}
        </Repere>
      ))}
    </ul>
  )
}
