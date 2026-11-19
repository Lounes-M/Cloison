import { PageConfidentialite } from '@/components/pages/PageConfidentialite'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('fr', 'confidentialite')

export default function Page() {
  return <PageConfidentialite langue="fr" />
}
