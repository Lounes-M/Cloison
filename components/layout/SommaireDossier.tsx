import { interfaceEspace as t } from '@/lib/content/interface'

export function SommaireDossier({ liens }: { liens: { id: string; titre: string }[] }) {
  return (
    <nav className="navigation-sections" aria-label={t.navigationDossier}>
      {liens.map(({ id, titre }) => (
        <a href={`#${id}`} key={id}>
          {titre}
        </a>
      ))}
    </nav>
  )
}
