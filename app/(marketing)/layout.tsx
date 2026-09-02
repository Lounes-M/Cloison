import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'

/**
 * Le site public : accueil et page agences.
 *
 * Les parentheses ne changent rien aux URL, elles ne servent qu'a donner un
 * layout commun a ces pages sans creer de segment. C'est ici que vit le chrome
 * marketing, en-tete et pied de page.
 *
 * Il etait jusqu'ici dans le layout racine, ce qui l'imposait a tout le site.
 * Le produit ne le voudra pas : un garant en train de deposer ses pieces n'a
 * que faire d'un menu « Tarifs » et d'un bouton « Demarrer ». Separer
 * maintenant coute le deplacement de deux pages ; separer plus tard couterait
 * le deplacement de trois espaces.
 */
export default function LayoutMarketing({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  )
}
