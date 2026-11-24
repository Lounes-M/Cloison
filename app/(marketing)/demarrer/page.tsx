import { connection } from 'next/server'

import { PageDemarrer } from '@/components/pages/PageDemarrer'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('fr', 'demarrer')

export default async function Page() {
  // Rendu a chaque requete : le proxy pose un nonce, qu'une page prerendue
  // ne pourrait pas porter. Le reste du site public reste statique.
  await connection()
  return <PageDemarrer langue="fr" />
}
