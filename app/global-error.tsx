'use client'

import { useEffect } from 'react'
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
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="fr" className={fontVariables}>
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-7 px-6 text-center">
          <p className="font-display text-2xl">CLOISON</p>

          <h1 className="font-display max-w-[620px] text-[clamp(1.75rem,5vw,2.75rem)] leading-tight">
            Le site est momentanément indisponible.
          </h1>

          <p className="max-w-[440px] text-lg font-semibold">
            Aucune donnée n&apos;a été perdue ni exposée. Réessaie dans un instant.
          </p>

          <button
            type="button"
            onClick={reset}
            className="press bg-cobalt outlined rounded-brut shadow-brut inline-flex cursor-pointer items-center justify-center px-8 py-4 text-[17px] font-bold text-white"
          >
            Recharger
          </button>

          {error.digest ? (
            <p className="text-muted text-xs">
              Référence à nous transmettre : <code className="font-mono">{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
