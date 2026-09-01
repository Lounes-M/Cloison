import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { site } from '@/lib/site'
import { fontVariables } from './fonts'
import './globals.css'

export const metadata: Metadata = {
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

export const viewport: Viewport = {
  themeColor: '#fff6e8',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={fontVariables}>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
        {/*
          Mesure d'audience sans cookie : rien n'est ecrit sur l'appareil du
          visiteur, aucun identifiant ne le suit d'un site a l'autre. C'est ce
          qui permet a la landing de ne pas s'ouvrir sur un bandeau de
          consentement : une page qui vend la confidentialite et commence par
          demander l'autorisation de pister se contredit toute seule.

          Le caractere exempte de consentement reste a faire confirmer par un
          conseil avant la campagne aupres des agences.
        */}
        <Analytics />
      </body>
    </html>
  )
}
