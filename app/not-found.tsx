import type { Metadata } from 'next'
import { connection } from 'next/server'
import { EcranIntrouvable } from '@/components/ui/EcranIntrouvable'
import { langueEspace } from '@/lib/langue-espace'

export const metadata: Metadata = {
  title: 'Page introuvable · Page not found',
}

export default async function NotFound() {
  // Rendue a chaque requete, jamais prerendue. Une adresse inconnue sous
  // l'applicatif (`/espace/nulle-part`) arrive ici sous la politique de
  // securite du proxy, avec un nonce par requete : une page prerendue au
  // build ne le porterait pas, et le navigateur refuserait ses scripts.
  await connection()

  return <EcranIntrouvable langueChoisie={await langueEspace()} />
}
