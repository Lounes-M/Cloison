'use client'

import { useEffect } from 'react'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'

/**
 * Frontiere d'erreur des pages : elle remplace le contenu de la route, le
 * layout racine restant monte. L'en-tete et le pied de page vivant desormais
 * dans ce layout, ils restent en place — le visiteur peut donc naviguer
 * ailleurs sans repasser par l'accueil.
 *
 * `digest` est l'identifiant que Next attribue a l'erreur cote serveur ; c'est
 * la seule chose exploitable pour retrouver la trace dans les logs, et la seule
 * qu'on affiche — verifie en production, le message brut ne fuit pas dans la
 * page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // En attendant un vrai collecteur d'erreurs, la console serveur/navigateur
    // reste le point de collecte.
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-7 px-6 py-20 text-center">
      <Logo className="text-2xl" />

      <h1 className="font-display max-w-[620px] text-[clamp(1.75rem,5vw,2.75rem)] leading-tight">
        Quelque chose s&apos;est mal passé de notre côté.
      </h1>

      <p className="max-w-[440px] text-lg font-semibold">
        Aucune donnée n&apos;a été perdue ni exposée. Réessaie, et si ça recommence, écris-nous.
      </p>

      <div className="flex flex-wrap justify-center gap-4">
        <Button onClick={reset}>Réessayer</Button>
        <Button href="/" tone="paper">
          Retour à l&apos;accueil
        </Button>
      </div>

      {error.digest ? (
        <p className="text-muted text-xs">
          Référence à nous transmettre : <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
    </main>
  )
}
