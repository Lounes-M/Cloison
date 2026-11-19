import { PageConnexion } from '@/components/pages/PageConnexion'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('fr', 'connexion')

export default function Page({ searchParams }: { searchParams: Promise<{ echec?: string }> }) {
  return <PageConnexion langue="fr" searchParams={searchParams} />
}
