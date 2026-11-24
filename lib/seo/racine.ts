import type { Metadata, Viewport } from 'next'

import { site } from '@/lib/site'

/**
 * Les metadonnees par defaut du site, reprises par chaque layout racine.
 * Une page les complete ou les remplace par les siennes.
 */
export const metadonneesRacine: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} · ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    'caution locative',
    'garant',
    'acte de cautionnement',
    'signature électronique',
    'dossier location',
    'agence immobilière',
  ],
  authors: [{ name: site.name }],
  openGraph: {
    type: 'website',
    locale: site.locale,
    url: site.url,
    siteName: site.name,
    title: `${site.name} · ${site.tagline}`,
    description: site.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} · ${site.tagline}`,
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const vueRacine: Viewport = {
  themeColor: '#faf4ec',
  colorScheme: 'light',
}
