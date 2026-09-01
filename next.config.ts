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

/**
 * URL publique du site, resolue une seule fois au build et exposee a tout le
 * code via `NEXT_PUBLIC_SITE_URL` (cote serveur comme cote client).
 *
 * Ordre de priorite :
 *
 * 1. `NEXT_PUBLIC_SITE_URL` si tu la definis toi-meme — elle gagne toujours.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL`, posee par Vercel : le domaine de
 *    production le plus court. C'est le `.vercel.app` tant qu'aucun domaine
 *    personnalise n'est rattache, puis le domaine personnalise des qu'il l'est.
 *    Elle ne contient pas le protocole, d'ou le `https://` ajoute ici.
 * 3. `localhost` en developpement.
 *
 * Consequence : rien a saisir pour la premiere mise en ligne, et rien a
 * modifier le jour du domaine definitif — un redeploiement suffit.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,

  // ATTENTION : tout ce qui est declare ici est substitue par sa valeur au
  // build, y compris dans le bundle envoye au navigateur des qu'un composant
  // client le reference. Ce bloc n'accueille que des valeurs publiques —
  // l'URL du site en est une, le visiteur est deja dessus. Une cle d'API, un
  // jeton ou un secret de signature n'ont rien a y faire : ils se lisent
  // uniquement cote serveur, via `process.env`, sans prefixe `NEXT_PUBLIC_`
  // et sans passer par ici.
  env: {
    NEXT_PUBLIC_SITE_URL: siteUrl,
  },

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
