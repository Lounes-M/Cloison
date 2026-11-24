import { ChromePublic } from '@/components/layout/ChromePublic'
import { DocumentRacine } from '@/components/layout/DocumentRacine'
import { metadonneesRacine, vueRacine } from '@/lib/seo/racine'

export const metadata = metadonneesRacine
export const viewport = vueRacine

/**
 * Le site public en anglais, sous `/en`. Meme chrome que le site francais :
 * seul le texte change. Voir `lib/i18n.ts`.
 */
export default function LayoutMarketingEn({ children }: { children: React.ReactNode }) {
  return (
    <DocumentRacine langue="en">
      <ChromePublic langue="en">{children}</ChromePublic>
    </DocumentRacine>
  )
}
