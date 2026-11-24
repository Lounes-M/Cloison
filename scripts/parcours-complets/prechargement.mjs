// Charge dans le processus Next du harnais par NODE_OPTIONS=--import.
//
// Le code de production appelle ses fournisseurs a des adresses ecrites en dur,
// et c'est voulu : aucune variable ne doit pouvoir les detourner en production.
// Le harnais detourne donc `fetch` ici, hors du depot applicatif, et seulement
// vers la boucle locale. Tout autre hote exterieur est refuse : un parcours
// local ne doit joindre personne.
const faux = process.env.PARCOURS_FAUX_FOURNISSEURS
if (!faux || new URL(faux).hostname !== '127.0.0.1') {
  throw new Error('PARCOURS_FAUX_FOURNISSEURS doit designer la boucle locale')
}

const DETOURS = new Map([
  ['openrouter.ai', '/openrouter'],
  ['eu.openrouter.ai', '/openrouter'],
  ['api.docage.com', '/docage'],
  ['recherche-entreprises.api.gouv.fr', '/annuaire'],
])
const LOCAUX = new Set(['127.0.0.1', 'localhost', '[::1]'])
const origine = globalThis.fetch

globalThis.fetch = function fetchDuHarnais(entree, options) {
  const url = new URL(entree instanceof Request ? entree.url : String(entree))
  if (LOCAUX.has(url.hostname)) return origine(entree, options)
  const prefixe = DETOURS.get(url.hostname)
  if (!prefixe) {
    return Promise.reject(new TypeError(`Hote exterieur refuse par le harnais : ${url.hostname}`))
  }
  const cible = new URL(`${prefixe}${url.pathname}${url.search}`, faux)
  return origine(entree instanceof Request ? new Request(cible, entree) : cible, options)
}
