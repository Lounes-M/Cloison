import type { MetadataRoute } from 'next'
import { site } from '@/lib/site'

/**
 * Manifeste d'application : nom, couleurs et icones quand le site est
 * ajoute a l'ecran d'accueil. Les icones sont tirees des SVG maitres par
 * `scripts/marque/rasteriser.mjs`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} · ${site.tagline}`,
    short_name: site.name,
    description: site.description,
    lang: 'fr',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf4ec',
    theme_color: '#035946',
    icons: [
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icones/icone-masquable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
