'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { Button } from '@/components/ui/Button'
import { NavigationReprise } from '@/components/ui/NavigationReprise'
import { erreurs as erreursEn } from '@/lib/content/en/erreurs'
import { erreurs as erreursFr } from '@/lib/content/erreurs'
import { COOKIE_LANGUE, choisir, lien, type Langue } from '@/lib/i18n'

/** La langue choisie dans un espace : un cookie lisible, sans rien de secret. */
function langueDuCookie(): Langue {
  return document.cookie.split('; ').includes(`${COOKIE_LANGUE}=en`) ? 'en' : 'fr'
}
const sansAbonnement = () => () => {}

/**
 * Frontiere d'erreur des pages : elle remplace le contenu de la route, le
 * layout racine restant monte. Elle fournit son propre en-tete et pied de
 * page pour permettre de reprendre la navigation.
 *
 * `digest` est l'identifiant que Next attribue a l'erreur cote serveur ; c'est
 * la seule chose exploitable pour retrouver la trace dans les logs, et la seule
 * qu'on affiche : verifie en production, le message brut ne fuit pas dans la
 * page.
 */
export default function Error({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const chemin = usePathname()
  const choisie = useSyncExternalStore<Langue>(sansAbonnement, langueDuCookie, () => 'fr')
  const langue: Langue = chemin === '/en' || chemin.startsWith('/en/') ? 'en' : choisie
  const erreurs = choisir(langue, erreursFr, erreursEn)

  useEffect(() => {
    // Le navigateur ne recoit aucun detail supplementaire dans la console.
    console.error('[interface] chargement impossible')
  }, [error])

  return (
    <div className="site-public" lang={langue}>
      <SiteHeader langue={langue} />
      <div className="sous-entete-fixe">
        <main className="ecran-reprise">
          <div className="carte-reprise">
            <span aria-hidden="true" className="repere-reprise">
              !
            </span>
            <h1>{erreurs.titreChargement}</h1>
            <p className="description-reprise">{erreurs.chargement}</p>
            <div className="actions-reprise">
              <Button onClick={() => window.location.reload()}>{erreurs.reessayer}</Button>
              <a
                href={lien(langue, '/')}
                className="lien-trace inline-flex min-h-[44px] items-center font-semibold"
              >
                {erreurs.accueil}
              </a>
            </div>
            <NavigationReprise langue={langue} />
            {error.digest ? (
              <p className="reference-reprise">
                {erreurs.reference} : <code>{error.digest}</code>
              </p>
            ) : null}
          </div>
        </main>
      </div>
      <SiteFooter langue={langue} />
    </div>
  )
}
