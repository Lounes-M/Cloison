import type { NextConfig } from 'next'

/**
 * En-tetes de securite appliques a toutes les reponses.
 *
 * Volontairement absent : une Content-Security-Policy. Une CSP stricte sous
 * App Router impose des nonces, donc un middleware et un rendu dynamique — on
 * echangerait aujourd'hui des pages entierement statiques contre une protection
 * qui n'a rien a proteger, le site ne recevant encore aucune donnee. A trancher
 * avec le socle produit (phase 2), pas avant.
 */
const securityHeaders = [
  {
    // Deux ans, sous-domaines inclus : a n'activer qu'une fois le domaine
    // definitivement en HTTPS, la directive etant difficile a revenir dessus.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    // Empeche le navigateur de deviner un type MIME — vecteur classique quand
    // le site servira des pieces televersees.
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Aucun tiers ne doit pouvoir encadrer une page Cloison : c'est la base
    // d'une attaque par superposition sur un bouton de signature.
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // Rien de tout cela n'est utilise ; le declarer evite qu'une dependance le
    // demande un jour sans qu'on s'en apercoive.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    // Isole l'origine des fenetres ouvertes depuis le site.
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
