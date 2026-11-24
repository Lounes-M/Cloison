/**
 * La Content-Security-Policy, en deux versions.
 *
 * Ce qu'une CSP attenue avant tout, c'est l'execution d'un script injecte
 * dans une page. La surface existe depuis que l'espace agence affiche ce que
 * d'autres ont saisi : le nom d'une piece, une adresse, une mention. React
 * echappe tout ce qu'il rend, et la CSP est la ceinture par-dessus les
 * bretelles : si un jour quelque chose passait, le navigateur refuserait de
 * l'executer.
 *
 * Deux politiques, parce que le site a deux natures.
 *
 * 1. Le site public est prerendu au build, sauf `/demarrer` et `/en/demarrer`,
 *    qui portent un nonce. Les autres pages n'ont pas de nonce par requete,
 *    et les scripts en ligne que Next y pose pour hydrater doivent passer
 *    par `'unsafe-inline'`. C'est une protection partielle, et elle est
 *    honnete : ces pages n'affichent rien qu'un tiers ait saisi.
 *
 * 2. L'applicatif, agence et porteurs de lien, est rendu a chaque requete. Le
 *    proxy y tire un nonce, et seuls les scripts qui le portent, ou que
 *    ceux-ci chargent (`'strict-dynamic'`), s'executent. Un script injecte
 *    dans la page ne porte pas le nonce : il ne s'execute pas.
 *
 * Ce module n'importe rien : il sert au proxy, qui tourne dans le runtime
 * Node.js, et a `next.config.ts`, qui est lu au build.
 */

/**
 * Les segments de premier niveau de l'applicatif, sans lecture des groupes de
 * routes : `(agence)` et `(porteur)` n'apparaissent pas dans l'URL.
 *
 * Cette liste doit rester le miroir exact de deux choses : le `matcher` du
 * proxy, que Next exige litteral, et les dossiers de `app/(agence)` et
 * `app/(porteur)`. Un test compare les trois. Un segment ecrit ici et absent
 * du proxy recevrait la politique du site public, sans nonce, et ses
 * scripts s'executeraient quand meme : c'est la derive silencieuse a
 * empecher.
 */
export const SEGMENTS_APPLICATIFS = [
  'espace',
  'connexion',
  'locataire',
  'garant',
  'lien',
  'lien-invalide',
  'remise-donnees',
] as const

/**
 * Pages publiques rendues a chaque requete pour porter un nonce.
 *
 * Seulement le formulaire d'ouverture. Le reste du site (`/`, `/agences`,
 * le marketing) est prerendu au build : un nonce par visite le rendrait
 * dynamique, et le cout n'est pas celui d'un formulaire. Ces pages gardent
 * donc `'unsafe-inline'`.
 *
 * `/en/demarrer` est la meme page. Le segment `en` ne peut pas etre exclu en
 * bloc : le reste de l'anglais resterait sans politique.
 */
export const PAGES_NONCE_PUBLIQUES = ['/demarrer', '/en/demarrer'] as const

/** Chemins exclus de la politique statique : l'applicatif, plus l'ouverture. */
export function segmentsSansPolitiqueStatique(): readonly string[] {
  return [...SEGMENTS_APPLICATIFS, 'demarrer', 'en/demarrer']
}

/**
 * Source Next des en-tetes de la politique statique.
 *
 * Tout ce qui n'est pas liste ici recoit `'unsafe-inline'`. Le proxy couvre
 * exactement le complement, avec un nonce.
 */
export function sourcePolitiqueStatique(): string {
  return `/((?!(?:${segmentsSansPolitiqueStatique().join('|')})(?:/|$)).*)`
}

export function estPageNoncePublique(chemin: string): boolean {
  return PAGES_NONCE_PUBLIQUES.some((page) => chemin === page || chemin.startsWith(`${page}/`))
}

/**
 * Ce que les deux politiques ont en commun.
 *
 * `style-src` garde `'unsafe-inline'` a dessein : un nonce ne couvre pas les
 * attributs `style=`, et le site en pose quelques-uns, inclinaisons et
 * retards d'animation. Un style injecte ne fait executer aucun code ; c'est
 * la concession qui coute le moins.
 *
 * `frame-ancestors 'none'` redit `X-Frame-Options: DENY` dans le vocabulaire
 * moderne : aucun tiers n'encadre une page Cloison, base d'une superposition
 * sur un bouton de signature.
 */
function commun(production: boolean): string[] {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // `blob:` et `data:` : la reduction d'une photo dans le navigateur, avant
    // depot, et les icones dessinees en ligne.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Les actions serveur, la mesure d'audience, rien d'autre. En
    // developpement, le rechargement a chaud passe par une WebSocket.
    production ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ]
}

/**
 * La politique du site public.
 *
 * `form-action 'self'` : les formulaires du site public ne soumettent qu'a
 * nous. Le paiement, qui redirige vers Stripe, vit dans l'applicatif.
 */
export function politiqueStatique(production = process.env.NODE_ENV === 'production'): string {
  return [
    ...commun(production),
    production
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
    "form-action 'self'",
  ].join('; ')
}

/**
 * La politique de l'applicatif, pour un nonce donne.
 *
 * `'strict-dynamic'` : un script qui porte le nonce peut en charger d'autres,
 * et ceux-la heritent de la confiance. C'est ce qui laisse passer la mesure
 * d'audience, inseree par un script deja autorise, sans avoir a nommer son
 * hote. Les navigateurs qui le comprennent ignorent alors `'self'`, garde
 * pour les autres.
 *
 * `form-action` admet Stripe : le reglement du locataire est un formulaire
 * dont l'action serveur repond par une redirection vers la page de paiement,
 * et Chrome applique `form-action` a cette redirection.
 */
export function politiqueAvecNonce(
  nonce: string,
  production = process.env.NODE_ENV === 'production',
): string {
  if (!/^[A-Za-z0-9+/=]{16,}$/.test(nonce)) {
    throw new Error('Nonce CSP invalide : il doit etre du base64 d au moins seize caracteres.')
  }
  return [
    ...commun(production),
    production
      ? `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'`
      : `script-src 'nonce-${nonce}' 'strict-dynamic' 'self' 'unsafe-eval' https://va.vercel-scripts.com`,
    "form-action 'self' https://checkout.stripe.com",
  ].join('; ')
}

/**
 * Un nonce neuf, seize octets tires au hasard, en base64.
 *
 * Web Crypto garde le generateur utilisable dans le proxy Node.js comme au build.
 */
export function nouveauNonce(): string {
  const octets = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...octets))
}
