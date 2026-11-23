import { PageIa } from '@/components/pages/PageIa'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('fr', 'ia')

export default function Page() {
  return <PageIa langue="fr" />
}
