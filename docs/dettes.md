# Dettes techniques

Ce que l'on sait devoir régler, et qu'on ne règle pas aujourd'hui. Chaque entrée dit **pourquoi**
c'est en attente et **à quel signal** on y revient — une dette sans condition de sortie devient un
oubli.

---

## Bloquées en amont

### ESLint reste en 9.x, ligne non supportée

**Constaté le** 1er septembre 2026, sur la PR Dependabot #3.

ESLint 9 n'est plus supporté en amont (`npm warn deprecated eslint@9.39.5`), mais ESLint 10 casse à
l'exécution :

```
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
```

`eslint-config-next@16.3.4` embarque une version d'`eslint-plugin-react` qui appelle encore
`context.getFilename()`, API supprimée dans ESLint 10. Aucune version de repli n'existe : 9.39.5 est
déjà la dernière 9.x.

Ce n'est pas une faille — ESLint tourne au build et en CI, jamais en production. C'est de
l'outillage figé sur une ligne qui ne recevra plus de correctifs.

**Signal de sortie** — `eslint-config-next` publie une version compatible ESLint 10. Alors : lever la
pause dans `.github/dependabot.yml` et laisser passer la montée.

### TypeScript reste en 6.x

**Constaté le** 1er septembre 2026, sur la PR Dependabot #4.

```
Error: typescript-eslint does not support TS 7.0.
```

Garde-fou explicite de `typescript-eslint`, tiré par `eslint-config-next`. Aucune version de repli :
6.0.3 est déjà la dernière 6.x.

Sans conséquence immédiate — TypeScript 6 est parfaitement fonctionnel — mais l'écart se creusera.

**Signal de sortie** — `typescript-eslint` prend en charge TS 7. Alors : lever la pause dans
`.github/dependabot.yml`.

> Les deux majeures sont mises en pause dans `.github/dependabot.yml`. Sans cela, Dependabot rouvre
> les mêmes PR chaque lundi et le bruit finit par masquer les mises à jour qui comptent.

---

## Décidées, à revoir plus tard

### Pas de Content-Security-Policy

Une CSP stricte sous App Router impose des nonces, donc un middleware et un rendu dynamique. On
échangerait aujourd'hui des pages entièrement statiques contre une protection sans objet : le site
ne reçoit aucune donnée.

**Signal de sortie** — le premier formulaire qui part en production, c'est-à-dire la phase 1. À
trancher avec le reste du socle produit.

### L'en-tête et le pied de page vivent dans `page.tsx`

Conséquence visible : lors d'une erreur, `app/error.tsx` remplace toute la page, chrome compris.
Acceptable tant qu'il n'y a qu'une seule route.

**Signal de sortie** — la deuxième route, en phase 1. Les remonter alors dans le layout racine.

### Aucun test automatisé

Assumé : il n'y a pas encore de logique métier à tester, et des tests d'interface sur une landing
statique coûteraient plus qu'ils ne rapporteraient.

**Signal de sortie** — la première logique métier, c'est-à-dire le calcul du ratio de solvabilité, en
phase 4. Les règles d'accès viennent avant, en phase 3, et se testent en premier.
