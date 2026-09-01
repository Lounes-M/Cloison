# Architecture

## État actuel

Un seul livrable : le site public, rendu entièrement en statique. Toutes les routes sont
prérendues au build (`○ Static`), il n'y a ni base de données, ni authentification, ni API.

Les composants sont des **Server Components** par défaut. Un seul est client :
`components/ui/Reveal.tsx`, qui a besoin d'un `IntersectionObserver`. C'est la règle à tenir —
`'use client'` se justifie, il ne se subit pas.

## Conventions

**Le contenu est séparé de la présentation.** `lib/content/home.ts` contient les chaînes, les
composants de `components/sections/` contiennent la mise en forme. Quand une deuxième page arrivera,
elle aura son propre fichier dans `lib/content/`. Cela rend une future internationalisation ou un CMS
mécaniques plutôt que douloureux.

**Les tokens de design sont en CSS, pas en TypeScript.** Tailwind 4 lit `@theme` dans
`app/globals.css`. Une couleur en dur dans un composant est un bug : elle échappe au thème et ne
suivra pas un changement de charte.

**Une section = un fichier.** `components/sections/Hero.tsx`, `Pricing.tsx`… La home se lit d'un
coup d'œil dans `app/page.tsx`.

## Ce que le produit va demander

Cloison est un produit à **trois acteurs qui ne voient pas la même chose du même dossier** :

| Acteur       | Voit                                                                 |
| ------------ | -------------------------------------------------------------------- |
| Le garant    | Ses propres pièces, ce qu'il couvre, le montant, l'échéance          |
| Le locataire | Un statut : dossier complet, garant éligible. Ni pièces, ni montants |
| L'agence     | Les pièces filigranées, le ratio calculé, l'acte pré-rempli          |

Le cloisonnement est la fonctionnalité, pas une option de confidentialité. Il devra donc être
appliqué **côté serveur**, sur chaque lecture, à partir du rôle porté par la session — jamais par un
filtrage côté client, jamais par une route devinable. La structure `app/` en groupes de routes
(`(marketing)`, `(app)`) accueillera cette séparation quand les espaces seront implémentés.

Points à trancher avant d'écrire la première ligne du produit :

- **Signature électronique** — prestataire eIDAS pour l'acte de cautionnement (loi ELAN).
- **Filigranage** — appliqué à la génération du lien agence, pas au dépôt : le garant ne doit jamais
  voir ses propres pièces dégradées. Le point de passage est acquis (voir ci-dessous), reste ce que
  le filigrane inscrit.

Le **stockage des pièces** n'en fait plus partie : il est tranché par
l'[ADR 0003](adr/0003-stockage-et-chiffrement-des-pieces.md). Les pièces sont chiffrées par notre
serveur avant de partir chez Supabase, avec une clé maîtresse qui vit chez Vercel — le chiffré et la
clé chez deux hébergeurs différents. Conséquence structurante : les URLs signées deviennent
inutilisables, toute lecture traverse une route serveur, et c'est là que le filigranage
s'appliquera. La rétention est de trois mois, et l'expiration détruit la clé du dossier plutôt que
d'espérer que la suppression atteigne les sauvegardes.

L'**identité** ne fait plus partie de cette liste non plus : elle est tranchée par
l'[ADR 0002](adr/0002-modele-d-acces-et-creation-de-compte.md). Le garant et le locataire arrivent
par lien signé et n'ont jamais de compte ; l'agence a de vrais comptes nominatifs, via Supabase
Auth. Trois populations, trois rôles Postgres — `anon`, `authenticated`, `porteur_lien` — pour que
la frontière soit portée par le rôle et non par une condition qu'une politique pourrait oublier.

## Qualité

`npm run check` enchaîne typecheck, lint et vérification de formatage. La CI GitHub Actions
(`.github/workflows/ci.yml`) lance la même chose plus le build sur chaque push et chaque pull
request. Aucun test automatisé pour l'instant — à ajouter dès que la première logique métier apparaît
(le calcul du ratio de solvabilité est le premier candidat évident).
