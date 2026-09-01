# Architecture

## État actuel

Un seul livrable : le site public, rendu entièrement en statique. Toutes les routes sont
prérendues au build (`○ Static`), il n'y a ni base de données, ni authentification, ni API.

Les composants sont des **Server Components** par défaut. Un seul est client :
`components/ui/Reveal.tsx`, qui a besoin d'un `IntersectionObserver`. C'est la règle à tenir :
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
appliqué **côté serveur**, sur chaque lecture, à partir du rôle porté par la session : jamais par un
filtrage côté client, jamais par une route devinable. La structure `app/` en groupes de routes
(`(marketing)`, `(app)`) accueillera cette séparation quand les espaces seront implémentés.

Les quatre points à trancher avant d'écrire la première ligne du produit **le sont tous**. Ils
forment la phase 2, et chacun a son ADR.

| Décision                   | Ce qui a été tranché                                                                                                                                                                                                                                                                                                                      | ADR                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Identité**               | Le garant et le locataire n'ont jamais de compte et arrivent par lien signé ; l'agence a de vrais comptes nominatifs, via Supabase Auth. Trois populations, trois rôles Postgres (`anon`, `authenticated`, `porteur_lien`) pour que la frontière soit portée par le rôle et non par une condition qu'une politique pourrait oublier.      | [0002](adr/0002-modele-d-acces-et-creation-de-compte.md)        |
| **Lien magique**           | Le locataire ouvrant lui-même son dossier, il donne son adresse et reçoit son lien ; l'e-mail est un canal de livraison, pas un moyen d'authentification. « Pas de compte » reste vrai à trois conditions vérifiables : aucun mot de passe, adresse attachée au dossier et non à une personne, rien qui se cumule d'un dossier à l'autre. | [0006](adr/0006-lien-magique-pour-le-locataire-et-le-garant.md) |
| **Stockage des pièces**    | Chiffrement applicatif avant l'envoi, clé maîtresse chez Vercel et chiffré chez Supabase : deux hébergeurs, deux rayons d'explosion. Rétention de trois mois, et l'expiration détruit la clé plutôt que d'espérer que la suppression atteigne les sauvegardes.                                                                            | [0003](adr/0003-stockage-et-chiffrement-des-pieces.md)          |
| **Filigranage**            | Marquage nominatif par consultation, sur des pages rasterisées pour que la marque ne s'enlève pas. Trace de consultation en écriture seule.                                                                                                                                                                                               | [0004](adr/0004-filigranage-et-trace-de-consultation.md)        |
| **Signature électronique** | Signature avancée eIDAS chez un prestataire UE capable de qualifié, pour que le niveau reste un paramètre. La mention de l'article 2297 du Code civil n'est jamais pré-remplie.                                                                                                                                                           | [0005](adr/0005-signature-electronique-de-l-acte.md)            |

Trois choses valent d'être retenues de l'ensemble, parce qu'elles ne se lisent pas dans un ADR pris
isolément.

**Un seul point de passage porte trois fonctions.** Le chiffrement interdit les URLs signées, donc
toute lecture d'une pièce traverse une route serveur ; c'est exactement là que le filigranage doit
s'appliquer, et là que la trace s'écrit. Déchiffrer, marquer, tracer : un seul endroit. Les
contraintes ont convergé au lieu de s'ajouter.

**Le nominatif tient à une décision prise trois ADR plus tôt.** Un filigrane qui désigne une
personne ne vaut que parce qu'un compte est une personne et non une agence. Sans l'ADR 0002,
l'ADR 0004 ne marquerait qu'un nom d'entreprise, c'est-à-dire personne.

**La rétention n'est pas uniforme.** Les pièces servent à décider et se détruisent à la décision ;
l'acte est un contrat et doit survivre au bail. La clé de chiffrement est donc attachée à la classe
de rétention, pas au dossier : c'est l'ADR 0005 qui précise l'ADR 0003 sur ce point.

## Qualité

`npm run check` enchaîne typecheck, lint et vérification de formatage. La CI GitHub Actions
(`.github/workflows/ci.yml`) lance la même chose plus le build sur chaque push et chaque pull
request. Aucun test automatisé pour l'instant : à ajouter dès que la première logique métier apparaît
(le calcul du ratio de solvabilité est le premier candidat évident).
