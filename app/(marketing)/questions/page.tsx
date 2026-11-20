import { PageQuestions } from '@/components/pages/PageQuestions'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('fr', 'questions')

export default function Page() {
  return <PageQuestions langue="fr" />
}
