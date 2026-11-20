import { PageAgences } from '@/components/pages/PageAgences'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('en', 'agences')

export default function Page() {
  return <PageAgences langue="en" />
}
