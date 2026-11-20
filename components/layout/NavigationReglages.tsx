import Link from 'next/link'
import { interfaceEspace as tFr } from '@/lib/content/interface'
import { preferences as preferencesFr } from '@/lib/content/preferences'
import { rappels as rappelsFr } from '@/lib/content/rappels'
import { applicationSecours as applicationSecoursFr } from '@/lib/content/application-secours'
import { connecteurs as connecteursFr } from '@/lib/content/connecteurs'
import { collaborateurs as collaborateursFr } from '@/lib/content/collaborateurs'
import { interfaceEspace as tEn } from '@/lib/content/en/interface'
import { preferences as preferencesEn } from '@/lib/content/en/preferences'
import { rappels as rappelsEn } from '@/lib/content/en/rappels'
import { applicationSecours as applicationSecoursEn } from '@/lib/content/en/application-secours'
import { connecteurs as connecteursEn } from '@/lib/content/en/connecteurs'
import { collaborateurs as collaborateursEn } from '@/lib/content/en/collaborateurs'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

export async function NavigationReglages({
  courant,
  administration = false,
}: {
  courant?: string
  administration?: boolean
}) {
  const langue = await langueEspace()
  const preferences = choisir(langue, preferencesFr, preferencesEn)
  const applicationSecours = choisir(langue, applicationSecoursFr, applicationSecoursEn)
  const rappels = choisir(langue, rappelsFr, rappelsEn)
  const connecteurs = choisir(langue, connecteursFr, connecteursEn)
  const collaborateurs = choisir(langue, collaborateursFr, collaborateursEn)
  const t = choisir(langue, tFr, tEn)

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
    <nav className="navigation-sections navigation-reglages" aria-label={t.reglages}>
      {liens.map(({ href, titre }) => (
        <Link key={href} href={href} aria-current={courant === href ? 'page' : undefined}>
          {titre}
        </Link>
      ))}
    </nav>
  )
}
