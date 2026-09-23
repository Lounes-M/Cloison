import Link from 'next/link'
import { erreurs } from '@/lib/content/erreurs'

/** Destinations publiques : aucun acces au dossier sans son parcours habituel. */
export function NavigationReprise() {
  return (
    <nav aria-label={erreurs.reprise} className="navigation-reprise">
      <Link href="/lien-invalide">{erreurs.dossier}</Link>
      <Link href="/connexion">{erreurs.agence}</Link>
    </nav>
  )
}
