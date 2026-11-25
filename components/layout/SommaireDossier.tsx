import { LienAncre } from '@/components/layout/LienAncre'
import { interfaceEspace as tFr } from '@/lib/content/interface'
import { interfaceEspace as tEn } from '@/lib/content/en/interface'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

export async function SommaireDossier({ liens }: { liens: { id: string; titre: string }[] }) {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

  return (
    <nav className="navigation-sections sommaire-dossier" aria-label={t.navigationDossier}>
      {liens.map(({ id, titre }, index) => (
        <LienAncre id={id} key={id}>
          <span aria-hidden="true" className="text-muted font-mono text-xs">
            {String(index + 1).padStart(2, '0')}
          </span>
          {titre}
        </LienAncre>
      ))}
    </nav>
  )
}
