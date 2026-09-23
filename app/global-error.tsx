'use client'

import { useEffect } from 'react'
import { erreurs } from '@/lib/content/erreurs'
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
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[interface] application indisponible')
  }, [error])

  return (
    <html lang="fr" className={fontVariables}>
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
                className="press bg-cobalt outlined rounded-brut shadow-brut inline-flex cursor-pointer items-center justify-center px-8 py-4 text-[17px] font-bold text-white"
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
