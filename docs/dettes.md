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

### Limitation de débit en mémoire sur le formulaire agence

`app/agences/action.ts` limite les envois avec une table en mémoire. Chaque instance serverless a la
sienne : la limite ne borne donc pas un attaquant réparti sur plusieurs instances. Elle suffit
contre le bruit ordinaire — double-clic, script naïf, envois répétés — et ce qu'elle protège est une
table sans lecture publique ni donnée sensible.

**Signal de sortie** — la première limite qui protège quelque chose de sérieux, c'est-à-dire les
liens d'accès en phase 3. Elle se fera alors avec un magasin partagé.

### Pas de Content-Security-Policy

Une CSP stricte sous App Router impose des nonces, donc un middleware et un rendu dynamique — on
échangerait des pages entièrement statiques contre cette protection.

**Signal déclenché puis redéfini le 1er septembre 2026.** Le signal initial était « le premier
formulaire en production », et le formulaire agence l'a déclenché. Réexaminé, il était mal choisi :
ce que la CSP atténue avant tout, c'est l'exécution de script injecté dans une page, et le
formulaire n'ouvre aucune surface de ce type — les données saisies partent vers Supabase et un
e-mail, elles ne sont jamais réaffichées sur le site.

**Nouveau signal de sortie** — la première page qui **affiche du contenu fourni par un tiers**,
c'est-à-dire l'espace agence montrant les pièces déposées, en phase 4. C'est là que la surface
apparaît réellement, et le rendu y sera dynamique de toute façon : le coût du nonce disparaît.

### Aucun test automatisé

Assumé : il n'y a pas encore de logique métier à tester, et des tests d'interface sur une landing
statique coûteraient plus qu'ils ne rapporteraient.

Nuance depuis l'[ADR 0002](adr/0002-modele-d-acces-et-creation-de-compte.md) : les règles d'accès
sont écrites, et elles se vérifient — mais **à la main**, avec `supabase/essais/`, sur un Postgres
local. Ce n'est pas rien : ce scénario a trouvé une variable homonyme d'une colonne qui rendait
`rejoindre_ou_creer_agence` inutilisable, là où la migration s'appliquait sans broncher. Ce qui
manque, c'est que la CI le rejoue, donc que personne ne puisse l'oublier.

**Signal de sortie** — la phase 3, quand les liens d'accès rejoindront les comptes d'agence. Le
scénario existe déjà ; il ne restera qu'à lui donner un Postgres dans `ci.yml` et à faire échouer le
build quand un refus attendu n'en est plus un. Le calcul du ratio de solvabilité, en phase 4, sera
le premier test de logique métier au sens habituel.

---

## Réglées

- **L'en-tête et le pied de page vivaient dans `page.tsx`** — remontés dans le layout racine le
  1er septembre 2026, à l'arrivée de la deuxième route (`/agences`), comme prévu. `app/error.tsx`
  et `app/not-found.tsx` conservent désormais la navigation du site.
