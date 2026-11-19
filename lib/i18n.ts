/**
 * Les deux langues du site public.
 *
 * Le francais vit a la racine (`/agences`), l'anglais sous `/en`
 * (`/en/agences`) : deux adresses stables, indexables, et aucune page ne
 * depend d'un cookie pour savoir quoi afficher. Les espaces connectes et les
 * courriels restent en francais.
 */
import type { Route } from 'next'

export type Langue = 'fr' | 'en'

export const LANGUES = ['fr', 'en'] as const satisfies readonly Langue[]

/** Les pages qui existent dans les deux langues. */
const TRADUITES = [
  '/agences',
  '/questions',
  '/demarrer',
  '/connexion',
  '/candidater',
  '/mentions-legales',
  '/confidentialite',
  '/conditions',
] as const

function estTraduite(chemin: string): boolean {
  return (
    chemin === '/' ||
    TRADUITES.some((p) => chemin === p || (p === '/candidater' && chemin.startsWith(`${p}/`)))
  )
}

/** Le texte de la langue demandee. */
export function choisir<F, E>(langue: Langue, fr: F, en: E): F | E {
  return langue === 'en' ? en : fr
}

/**
 * L'adresse d'un lien interne dans la langue demandee. Une page qui n'existe
 * qu'en francais (un espace connecte, `/lien-invalide`) garde son adresse.
 */
export function lien(langue: Langue, href: string): Route {
  if (langue === 'fr' || !href.startsWith('/')) return href as Route
  const [chemin = '/', ancre] = href.split('#')
  if (!estTraduite(chemin || '/')) return href as Route
  const base = chemin === '/' || chemin === '' ? '/en' : `/en${chemin}`
  return (ancre ? `${base}#${ancre}` : base) as Route
}

/** La langue d'une adresse du site public. */
export function langueDuChemin(chemin: string): Langue {
  return chemin === '/en' || chemin.startsWith('/en/') ? 'en' : 'fr'
}

/**
 * La meme page dans l'autre langue, ou `null` si elle n'existe pas : la
 * bascule renvoie alors a l'accueil de l'autre langue.
 */
export function cheminDansLangue(chemin: string, cible: Langue): Route {
  const nu = langueDuChemin(chemin) === 'en' ? chemin.slice(3) || '/' : chemin
  if (!estTraduite(nu)) return (cible === 'en' ? '/en' : '/') as Route
  return lien(cible, nu)
}
