import Link from 'next/link'
import { erreurs as erreursFr } from '@/lib/content/erreurs'
import { erreurs as erreursEn } from '@/lib/content/en/erreurs'
import { choisir, lien, type Langue } from '@/lib/i18n'

/** Destinations publiques : aucun acces au dossier sans son parcours habituel. */
export function NavigationReprise({ langue = 'fr' }: { langue?: Langue }) {
  const erreurs = choisir(langue, erreursFr, erreursEn)
  return (
    <nav aria-label={erreurs.reprise} className="navigation-reprise">
      <Link href="/lien-invalide">{erreurs.dossier}</Link>
      <Link href={lien(langue, '/connexion')}>{erreurs.agence}</Link>
    </nav>
  )
}
