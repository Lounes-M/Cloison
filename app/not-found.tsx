import type { Metadata } from 'next'
import { connection } from 'next/server'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { Button } from '@/components/ui/Button'
import { NavigationReprise } from '@/components/ui/NavigationReprise'
import { erreurs } from '@/lib/content/erreurs'

export const metadata: Metadata = {
  title: 'Page introuvable',
}

export default async function NotFound() {
  // Rendue a chaque requete, jamais prerendue. Une adresse inconnue sous
  // l'applicatif (`/espace/nulle-part`) arrive ici sous la politique de
  // securite du proxy, avec un nonce par requete : une page prerendue au
  // build ne le porterait pas, et le navigateur refuserait ses scripts.
  await connection()

  return (
    <>
      <SiteHeader />
      <main className="ecran-reprise">
        <div className="carte-reprise">
          <p className="font-display text-cobalt text-[clamp(4rem,12vw,7rem)] leading-none">404</p>
          <h1>{erreurs.titreIntrouvable}</h1>
          <p className="description-reprise">{erreurs.adresse}</p>
          <div className="actions-reprise">
            <Button href="/">{erreurs.accueil}</Button>
          </div>
          <NavigationReprise />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
