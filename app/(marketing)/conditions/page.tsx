import { PageConditions } from '@/components/pages/PageConditions'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('fr', 'conditions')

export default function Page() {
  return <PageConditions langue="fr" />
}
