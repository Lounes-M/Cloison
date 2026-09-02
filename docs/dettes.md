# Dettes techniques

Ce que l'on sait devoir régler, et qu'on ne règle pas aujourd'hui. Chaque entrée dit **pourquoi**
c'est en attente et **à quel signal** on y revient : une dette sans condition de sortie devient un
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

Ce n'est pas une faille : ESLint tourne au build et en CI, jamais en production. C'est de
l'outillage figé sur une ligne qui ne recevra plus de correctifs.

**Signal de sortie** : `eslint-config-next` publie une version compatible ESLint 10. Alors : lever la
pause dans `.github/dependabot.yml` et laisser passer la montée.

### TypeScript reste en 6.x

**Constaté le** 1er septembre 2026, sur la PR Dependabot #4.

```
Error: typescript-eslint does not support TS 7.0.
```

Garde-fou explicite de `typescript-eslint`, tiré par `eslint-config-next`. Aucune version de repli :
6.0.3 est déjà la dernière 6.x.

Sans conséquence immédiate (TypeScript 6 est parfaitement fonctionnel) mais l'écart se creusera.

**Signal de sortie** : `typescript-eslint` prend en charge TS 7. Alors : lever la pause dans
`.github/dependabot.yml`.

> Les deux majeures sont mises en pause dans `.github/dependabot.yml`. Sans cela, Dependabot rouvre
> les mêmes PR chaque lundi et le bruit finit par masquer les mises à jour qui comptent.

---

## Décidées, à revoir plus tard

### Limitation de débit en mémoire sur le formulaire agence

`app/agences/action.ts` limite les envois avec une table en mémoire. Chaque instance serverless a la
sienne : la limite ne borne donc pas un attaquant réparti sur plusieurs instances. Elle suffit
contre le bruit ordinaire (double-clic, script naïf, envois répétés) et ce qu'elle protège est une
table sans lecture publique ni donnée sensible.

**Signal déclenché le 1er septembre 2026**, par l'[ADR 0006](adr/0006-lien-magique-pour-le-locataire-et-le-garant.md).
Le point d'envoi d'un lien magique est exactement ce qu'il ne faut pas laisser sans limite : il
envoie un e-mail à une adresse choisie par l'appelant, ce qui en fait à la fois un amplificateur de
spam et un moyen de savoir si une adresse a un dossier.

**Ce que ça demande** : un magasin partagé, et une réponse identique que l'adresse existe ou non.
Ce n'est plus une amélioration ultérieure mais un prérequis de mise en service, à livrer avec le
parcours locataire.

### Pas de Content-Security-Policy

Une CSP stricte sous App Router impose des nonces, donc un middleware et un rendu dynamique : on
échangerait des pages entièrement statiques contre cette protection.

**Signal déclenché puis redéfini le 1er septembre 2026.** Le signal initial était « le premier
formulaire en production », et le formulaire agence l'a déclenché. Réexaminé, il était mal choisi :
ce que la CSP atténue avant tout, c'est l'exécution de script injecté dans une page, et le
formulaire n'ouvre aucune surface de ce type : les données saisies partent vers Supabase et un
e-mail, elles ne sont jamais réaffichées sur le site.

**Nouveau signal de sortie** : la première page qui **affiche du contenu fourni par un tiers**,
c'est-à-dire l'espace agence montrant les pièces déposées, en phase 4. C'est là que la surface
apparaît réellement, et le rendu y sera dynamique de toute façon : le coût du nonce disparaît.

---

## Réglées

- **L'en-tête et le pied de page vivaient dans `page.tsx`** : remontés dans le layout racine le
  1er septembre 2026, à l'arrivée de la deuxième route (`/agences`), comme prévu. `app/error.tsx`
  et `app/not-found.tsx` conservent désormais la navigation du site.
- **Aucun test automatisé** : réglé le 2 septembre 2026, en ouverture de la phase 3, et le signal
  de sortie était bien celui-là. Le scénario manuel de `supabase/essais/acces-agences.sql` est
  devenu dix-sept tests assertifs qui tournent dans `npm run check` et dans la CI. Un détail du
  signal s'est révélé faux : il annonçait « donner un Postgres dans `ci.yml` ». PGlite embarque
  Postgres dans le processus de test, donc il n'y a ni service à déclarer ni Docker à installer,
  ni en local ni dans la CI. Le harnais a été vu rouge avant d'être livré, en ouvrant volontairement
  la lecture de `demandes_agence` au rôle `anon`.
