import { PageDemarrer } from '@/components/pages/PageDemarrer'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('fr', 'demarrer')

export default function Page() {
  return <PageDemarrer langue="fr" />
}
