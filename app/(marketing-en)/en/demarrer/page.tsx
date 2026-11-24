import { connection } from 'next/server'

import { PageDemarrer } from '@/components/pages/PageDemarrer'
import { metadonnees } from '@/lib/seo/pages'

export const metadata = metadonnees('en', 'demarrer')

export default async function Page() {
  // Meme nonce que la page francaise : le formulaire n'est pas prerendu.
  await connection()
  return <PageDemarrer langue="en" />
}
