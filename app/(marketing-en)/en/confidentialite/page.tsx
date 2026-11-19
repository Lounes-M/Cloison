import { PageConfidentialite } from '@/components/pages/PageConfidentialite'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('en', 'confidentialite')

export default function Page() {
  return <PageConfidentialite langue="en" />
}
