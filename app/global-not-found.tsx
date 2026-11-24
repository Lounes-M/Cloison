import type { Metadata } from 'next'
import { connection } from 'next/server'

import { DocumentIntrouvable } from '@/components/layout/DocumentIntrouvable'
import { langueEspace } from '@/lib/langue-espace'
import './globals.css'

export const metadata: Metadata = {
  title: 'Page introuvable · Page not found · Cloison',
  robots: { index: false, follow: false },
}

/**
 * Une adresse qui ne correspond a aucune route, ou que ce soit sur le site.
 *
 * C'est une route a part, hors de l'arbre des pages : une page 404 posee a la
 * racine (`not-found.tsx`) etait au contraire rendue dans l'arbre de chaque
 * page, et comme elle lit le cookie de langue et attend la requete, plus
 * aucune page du site public n'etait prerendue. Ici, elle ne coute qu'a
 * elle-meme.
 *
 * Rendue a chaque requete, jamais prerendue. Une adresse inconnue sous
 * l'applicatif (`/espace/nulle-part`) arrive ici sous la politique de
 * securite du proxy, avec un nonce par requete : une page prerendue au build
 * ne le porterait pas, et le navigateur refuserait ses scripts.
 *
 * Une page refusee a l'interieur d'un groupe (`notFound()`) ne passe pas par
 * ici : elle rend le `not-found.tsx` de son groupe, dans son cadre.
 */
export default async function GlobalNotFound() {
  await connection()

  return <DocumentIntrouvable langueChoisie={await langueEspace()} />
}
