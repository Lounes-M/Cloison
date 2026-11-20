import { SiteFooter } from '@/components/layout/SiteFooter'
import { FournisseurLangue } from '@/components/langue/LangueContexte'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { interfaceEspace as interfaceEn } from '@/lib/content/en/interface'
import { interfaceEspace as interfaceFr } from '@/lib/content/interface'
import { choisir, type Langue } from '@/lib/i18n'

/**
 * Le chrome du site public dans une langue : lien de saut, en-tete, contenu,
 * pied de page.
 *
 * La balise `<html>` du layout racine annonce le francais, langue des espaces
 * connectes. Le site anglais corrige cela sur son propre conteneur : `lang`
 * vaut pour tout ce qu'il contient, et c'est ce que lisent les lecteurs
 * d'ecran et les traducteurs automatiques.
 */
export function ChromePublic({ langue, children }: { langue: Langue; children: React.ReactNode }) {
  const interfaceEspace = choisir(langue, interfaceFr, interfaceEn)
  return (
    <div className="site-public" lang={langue}>
      <a
        href="#contenu"
        className="bg-paper text-ink fixed top-3 left-3 z-[60] inline-flex min-h-[44px] -translate-y-32 items-center rounded-lg px-4 py-3 font-semibold shadow-lg focus:translate-y-0"
      >
        {interfaceEspace.principal}
      </a>
      <SiteHeader langue={langue} />
      <div id="contenu" tabIndex={-1} className="sous-entete-fixe">
        <FournisseurLangue langue={langue}>{children}</FournisseurLangue>
      </div>
      <SiteFooter langue={langue} />
    </div>
  )
}
