/**
 * Doublure de `server-only`.
 *
 * Le vrai module leve des qu'il est importe hors d'un composant serveur, ce
 * qui est precisement son interet : il fait echouer la compilation si un
 * composant client importe un module serveur. Mais un test n'est ni l'un ni
 * l'autre, et l'import ferait echouer le fichier entier avant la premiere
 * assertion.
 *
 * On le neutralise donc pour les tests seulement. La protection reste entiere
 * la ou elle compte : `next build` utilise le vrai module.
 */
export {}
