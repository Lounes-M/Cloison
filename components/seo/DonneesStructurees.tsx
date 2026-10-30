import { jsonPourScript } from '@/lib/seo/faq'

/**
 * Un bloc de donnees, pas un script : le navigateur ne l'execute pas, donc la
 * politique de securite du contenu et son nonce ne le concernent pas.
 */
export function DonneesStructurees({ donnees }: { donnees: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonPourScript(donnees) }}
    />
  )
}
