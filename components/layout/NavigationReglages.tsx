import Link from 'next/link'
import { interfaceEspace as t } from '@/lib/content/interface'
import { preferences } from '@/lib/content/preferences'
import { rappels } from '@/lib/content/rappels'
import { applicationSecours } from '@/lib/content/application-secours'
import { connecteurs } from '@/lib/content/connecteurs'
import { collaborateurs } from '@/lib/content/collaborateurs'

export function NavigationReglages({
  courant,
  administration = false,
}: {
  courant?: string
  administration?: boolean
}) {
  const liens = [
    { href: '/espace/notifications' as const, titre: preferences.titre },
    { href: '/espace/securite' as const, titre: applicationSecours.titre },
    ...(administration
      ? [
          { href: '/espace/rappels' as const, titre: rappels.titre },
          { href: '/espace/connecteurs' as const, titre: connecteurs.titre },
          { href: '/espace/collaborateurs' as const, titre: collaborateurs.titre },
        ]
      : []),
  ]
  return (
    <nav className="navigation-sections" aria-label={t.reglages}>
      {liens.map(({ href, titre }) => (
        <Link key={href} href={href} aria-current={courant === href ? 'page' : undefined}>
          {titre}
        </Link>
      ))}
    </nav>
  )
}
