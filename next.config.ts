import type { NextConfig } from 'next'

/**
 * En-tetes de securite appliques a toutes les reponses.
 *
 * Volontairement absent : une Content-Security-Policy. Une CSP stricte sous
 * App Router impose des nonces, donc un middleware et un rendu dynamique : on
 * echangerait aujourd'hui des pages entierement statiques contre une protection
 * sans objet.
 *
 * Le site recoit des donnees depuis le formulaire agence, mais ce n'est pas la
 * question : ce qu'une CSP attenue avant tout, c'est l'execution de script
 * injecte dans une page, et rien de ce qui est saisi n'est jamais reaffiche.
 * La surface apparait quand une page montre du contenu fourni par un tiers,
 * c'est-a-dire l'espace agence et les pieces deposees, en phase 4. Le rendu y
 * sera dynamique de toute facon : le cout du nonce disparait.
 *
 * Voir docs/dettes.md, ou ce signal est trace.
 */
const securityHeaders = [
  {
    // Deux ans, sous-domaines inclus : a n'activer qu'une fois le domaine
    // definitivement en HTTPS, la directive etant difficile a revenir dessus.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    // Empeche le navigateur de deviner un type MIME : vecteur classique quand
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
 * 1. `NEXT_PUBLIC_SITE_URL` si tu la renseignes toi-meme : elle gagne toujours.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL`, posee par Vercel : le domaine de
 *    production le plus court. C'est le `.vercel.app` tant qu'aucun domaine
 *    personnalise n'est rattache, puis le domaine personnalise des qu'il l'est.
 *    Elle ne contient pas le protocole, d'ou le `https://` ajoute ici.
 * 3. `localhost` en developpement.
 *
 * Consequence : rien a saisir pour la premiere mise en ligne, et rien a
 * modifier le jour du domaine definitif : un redeploiement suffit.
 */

/**
 * Premiere valeur reellement renseignee.
 *
 * `??` ne suffit pas : il ne se declenche que sur `null` et `undefined`. Une
 * variable creee dans le tableau de bord Vercel puis laissee vide vaut `''`,
 * ce qui l'emporterait sur toutes les sources suivantes et produirait une URL
 * invalide. Une variable vide vaut absente.
 */
function premiereRenseignee(...valeurs: (string | undefined)[]): string | undefined {
  for (const valeur of valeurs) {
    const propre = valeur?.trim()
    if (propre) return propre
  }
  return undefined
}

/** Accepte `cloison.fr` comme `https://cloison.fr`, et retire la barre finale. */
function normaliseUrl(valeur: string): string {
  const avecProtocole = /^https?:\/\//i.test(valeur) ? valeur : `https://${valeur}`
  return avecProtocole.replace(/\/+$/, '')
}

const domaineVercel = premiereRenseignee(process.env.VERCEL_PROJECT_PRODUCTION_URL)

const siteUrl = normaliseUrl(
  premiereRenseignee(process.env.NEXT_PUBLIC_SITE_URL, domaineVercel) ?? 'http://localhost:3000',
)

// Echoue ici, avec un message qui dit quoi faire, plutot que quinze lignes plus
// loin sur le `new URL()` des metadonnees.
try {
  new URL(siteUrl)
} catch {
  throw new Error(
    `URL du site invalide : ${JSON.stringify(siteUrl)}. ` +
      `Verifie NEXT_PUBLIC_SITE_URL dans les variables d'environnement : soit une URL ` +
      `complete (https://cloison.fr), soit supprime-la entierement pour laisser Vercel ` +
      `fournir le domaine de production.`,
  )
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,

  experimental: {
    serverActions: {
      // Le depot d'une piece passe par une action serveur, parce que le
      // chiffrement impose de passer par nous. Next borne le corps a 1 Mo par
      // defaut ; on monte a la borne de Vercel, 4,5 Mo, que rien ne depasse de
      // toute facon. La borne pratique par fichier, 4 Mo, vit dans
      // `lib/garant/validation.ts`, et la borne haute, 20 Mo, dans la base.
      bodySizeLimit: '4.5mb',
    },
  },

  // ATTENTION : tout ce qui est declare ici est substitue par sa valeur au
  // build, y compris dans le bundle envoye au navigateur des qu'un composant
  // client le reference. Ce bloc n'accueille que des valeurs publiques :
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
