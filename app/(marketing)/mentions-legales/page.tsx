import { PageMentionsLegales } from '@/components/pages/PageMentionsLegales'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('fr', 'mentions')

export default function Page() {
  return <PageMentionsLegales langue="fr" />
}
