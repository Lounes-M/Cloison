import { ChromePublic } from '@/components/layout/ChromePublic'

/**
 * Le site public en anglais, sous `/en`. Meme chrome que le site francais :
 * seul le texte change. Voir `lib/i18n.ts`.
 */
export default function LayoutMarketingEn({ children }: { children: React.ReactNode }) {
  return <ChromePublic langue="en">{children}</ChromePublic>
}
