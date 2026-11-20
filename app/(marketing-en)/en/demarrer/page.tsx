import { PageDemarrer } from '@/components/pages/PageDemarrer'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('en', 'demarrer')

export default function Page() {
  return <PageDemarrer langue="en" />
}
