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
  ]
}
