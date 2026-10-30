import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { interfaceEspace } from '@/lib/content/interface'

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
 *
 * Le lien de saut passe l'en-tete au clavier, comme dans les espaces : il
 * vise une enveloppe et non le `<main>` de chaque page, que le layout ne
 * connait pas.
 */
export default function LayoutMarketing({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#contenu"
        className="bg-sun outlined fixed top-3 left-3 z-[60] -translate-y-32 rounded-lg px-4 py-3 font-bold focus:translate-y-0"
      >
        {interfaceEspace.principal}
      </a>
      <SiteHeader />
      <div id="contenu" tabIndex={-1}>
        {children}
      </div>
      <SiteFooter />
    </>
  )
}
