import type { MetadataRoute } from 'next'
import { site } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date()

  return [
    {
      url: site.url,
      lastModified: maintenant,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${site.url}/agences`,
      lastModified: maintenant,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${site.url}/questions`,
      lastModified: maintenant,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    ...['/mentions-legales', '/confidentialite', '/conditions'].map((chemin) => ({
      url: `${site.url}${chemin}`,
      lastModified: maintenant,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ]
}
