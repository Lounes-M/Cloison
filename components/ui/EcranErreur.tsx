'use client'

import { useEffect } from 'react'

import { useLangue } from '@/components/langue/LangueContexte'
import { Button } from '@/components/ui/Button'
import { NavigationReprise } from '@/components/ui/NavigationReprise'
import { erreurs as erreursEn } from '@/lib/content/en/erreurs'
import { erreurs as erreursFr } from '@/lib/content/erreurs'
import { choisir, lien } from '@/lib/i18n'

/**
 * Frontiere d'erreur des pages d'un groupe : elle remplace le contenu de la
 * route, le cadre du groupe (en-tete public ou cadre d'espace) restant monte.
 * La navigation et la bascule de langue restent donc disponibles, et la
 * langue est celle que le cadre fournit deja.
 *
 * `digest` est l'identifiant que Next attribue a l'erreur cote serveur ; c'est
 * la seule chose exploitable pour retrouver la trace dans les logs, et la seule
 * qu'on affiche : verifie en production, le message brut ne fuit pas dans la
 * page.
 *
 * `region` vaut `div` dans un espace, dont le cadre porte deja le `<main>`.
 */
export function EcranErreur({
  error,
  region: Region = 'main',
}: {
  error: Error & { digest?: string }
  region?: 'main' | 'div'
}) {
  const langue = useLangue()
  const erreurs = choisir(langue, erreursFr, erreursEn)

  useEffect(() => {
    // Le navigateur ne recoit aucun detail supplementaire dans la console.
    console.error('[interface] chargement impossible')
  }, [error])

  return (
    <Region className="ecran-reprise">
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
    </Region>
  )
}
