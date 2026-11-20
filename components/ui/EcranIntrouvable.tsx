'use client'

import { usePathname } from 'next/navigation'

import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { Button } from '@/components/ui/Button'
import { NavigationReprise } from '@/components/ui/NavigationReprise'
import { erreurs as erreursEn } from '@/lib/content/en/erreurs'
import { erreurs as erreursFr } from '@/lib/content/erreurs'
import { choisir, lien, type Langue } from '@/lib/i18n'

/**
 * L'ecran 404, dans la langue de la personne : celle de l'adresse demandee si
 * elle est sous `/en`, sinon celle que la personne a choisie dans son espace.
 */
export function EcranIntrouvable({ langueChoisie }: { langueChoisie: Langue }) {
  const chemin = usePathname()
  const langue: Langue = chemin === '/en' || chemin.startsWith('/en/') ? 'en' : langueChoisie
  const erreurs = choisir(langue, erreursFr, erreursEn)

  return (
    <div className="site-public" lang={langue}>
      <SiteHeader langue={langue} />
      <div className="sous-entete-fixe">
        <main className="ecran-reprise">
          <div className="carte-reprise">
            <p className="font-display text-cobalt text-[clamp(4rem,12vw,7rem)] leading-none">
              404
            </p>
            <h1>{erreurs.titreIntrouvable}</h1>
            <p className="description-reprise">{erreurs.adresse}</p>
            <div className="actions-reprise">
              <Button href={lien(langue, '/')}>{erreurs.accueil}</Button>
            </div>
            <NavigationReprise langue={langue} />
          </div>
        </main>
      </div>
      <SiteFooter langue={langue} />
    </div>
  )
}
