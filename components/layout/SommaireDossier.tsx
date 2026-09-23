import { interfaceEspace as t } from '@/lib/content/interface'

export function SommaireDossier({ liens }: { liens: { id: string; titre: string }[] }) {
  return (
    <nav className="navigation-sections sommaire-dossier" aria-label={t.navigationDossier}>
      {liens.map(({ id, titre }, index) => (
        <a href={`#${id}`} key={id}>
          <span aria-hidden="true" className="text-muted font-mono text-xs">
            {String(index + 1).padStart(2, '0')}
          </span>
          {titre}
        </a>
      ))}
    </nav>
  )
}
