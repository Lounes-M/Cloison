import { PageQuestions } from '@/components/pages/PageQuestions'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('en', 'questions')

export default function Page() {
  return <PageQuestions langue="en" />
}
