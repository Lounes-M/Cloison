import type { Metadata } from 'next'
import { connection } from 'next/server'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Page introuvable',
}

export default async function NotFound() {
  // Rendue a chaque requete, jamais prerendue. Une adresse inconnue sous
  // l'applicatif (`/espace/nulle-part`) arrive ici sous la politique de
  // securite du middleware, avec un nonce par requete : une page prerendue au
  // build ne le porterait pas, et le navigateur refuserait ses scripts.
  await connection()

  return (
    <>
      <SiteHeader />
      {/* `min-h-[70vh]` et non `min-h-screen` : l'en-tete et le pied de page
          occupent desormais leur part, et un plein ecran repousserait le pied
          hors de vue. */}
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-6 py-20 text-center">
        {/* Le 404 porte le titre de la page : sans lui, elle n'aurait aucun
            titre de niveau 1, et le logo de l'en-tete suffit desormais a
            l'identite. */}
        <h1 className="font-display text-cobalt text-[clamp(3rem,12vw,120px)] leading-none">404</h1>
        <p className="max-w-[420px] text-lg font-semibold">
          Cette porte ne mène nulle part. Rien n&apos;a fuité, il n&apos;y a juste rien ici.
        </p>
        <Button href="/">Retour à l&apos;accueil</Button>
      </main>
      <SiteFooter />
    </>
  )
}
