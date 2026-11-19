import { PageAccueil } from '@/components/pages/PageAccueil'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('en', 'accueil')

export default function Page() {
  return <PageAccueil langue="en" />
}
