'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { erreurs as erreursEn } from '@/lib/content/en/erreurs'
import { erreurs as erreursFr } from '@/lib/content/erreurs'
import { COOKIE_LANGUE, type Langue } from '@/lib/i18n'
import { fontVariables } from './fonts'
import './globals.css'

/**
 * Dernier filet : cette frontiere ne se declenche que si le layout racine
 * lui-meme a echoue. Elle remplace donc tout le document, `<html>` et `<body>`
 * compris, et ne peut compter sur rien de ce que le layout met en place.
 *
 * C'est pourquoi elle ne reutilise ni `<Logo>` ni `<Button>` : un composant
 * partage casse est precisement un scenario qui amene ici. Tout est ecrit en
 * dur, sans dependance.
 */
function langueDuNavigateur(): Langue {
  const chemin = window.location.pathname
  if (chemin === '/en' || chemin.startsWith('/en/')) return 'en'
  return document.cookie.split('; ').includes(`${COOKIE_LANGUE}=en`) ? 'en' : 'fr'
}
const sansAbonnement = () => () => {}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const langue = useSyncExternalStore<Langue>(sansAbonnement, langueDuNavigateur, () => 'fr')
  const erreurs = langue === 'en' ? erreursEn : erreursFr

  useEffect(() => {
    console.error('[interface] application indisponible')
  }, [error])

  return (
    <html lang={langue} className={fontVariables}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <main className="ecran-reprise min-h-dvh">
          <div className="carte-reprise">
            <p className="font-display text-cobalt text-xl">CLOISON</p>

            <h1>{erreurs.titreIndisponibilite}</h1>

            <p className="description-reprise">{erreurs.indisponibilite}</p>

            <div className="actions-reprise">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn btn-principal btn-grand"
              >
                {erreurs.recharger}
              </button>
            </div>

            {error.digest ? (
              <p className="reference-reprise">
                {erreurs.reference} : <code>{error.digest}</code>
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  )
}
