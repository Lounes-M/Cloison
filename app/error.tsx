'use client'

import { useEffect } from 'react'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { Button } from '@/components/ui/Button'
import { NavigationReprise } from '@/components/ui/NavigationReprise'
import { erreurs } from '@/lib/content/erreurs'

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
  useEffect(() => {
    // Le navigateur ne recoit aucun detail supplementaire dans la console.
    console.error('[interface] chargement impossible')
  }, [error])

  return (
    <>
      <SiteHeader />
      <main className="ecran-reprise">
        <div className="carte-reprise">
          <span aria-hidden="true" className="repere-reprise">
            !
          </span>
          <h1>{erreurs.titreChargement}</h1>
          <p className="description-reprise">{erreurs.chargement}</p>
          <div className="actions-reprise">
            <Button onClick={() => window.location.reload()}>{erreurs.reessayer}</Button>
            <Button href="/" tone="paper">
              {erreurs.accueil}
            </Button>
          </div>
          <NavigationReprise />
          {error.digest ? (
            <p className="reference-reprise">
              {erreurs.reference} : <code>{error.digest}</code>
            </p>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
