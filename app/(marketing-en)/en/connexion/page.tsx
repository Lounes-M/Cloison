import { PageConnexion } from '@/components/pages/PageConnexion'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('en', 'connexion')

export default function Page({ searchParams }: { searchParams: Promise<{ echec?: string }> }) {
  return <PageConnexion langue="en" searchParams={searchParams} />
}
