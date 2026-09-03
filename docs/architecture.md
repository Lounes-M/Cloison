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

| Acteur       | `dossiers`                    | `engagements`     | `pieces`       | `cles_dossier`    | `storage.objects`       | `journal_acces`      |
| ------------ | ----------------------------- | ----------------- | -------------- | ----------------- | ----------------------- | -------------------- |
| Le locataire | lecture, plus `email_garant`  | **rien**          | **rien**       | **rien**          | **rien**                | inscrit, ne lit pas  |
| Le garant    | lecture                       | lecture, écriture | lecture, dépôt | lecture, création | dépôt, lecture, retrait | lecture, inscription |
| L'agence     | lecture, plus `statut`        | lecture           | lecture        | lecture           | lecture                 | lecture, inscription |
| `anon`       | `ouvrir_dossier()` uniquement | **rien**          | **rien**       | **rien**          | **rien**                | **rien**             |

La matrice est appliquée par les migrations 0003, 0005, 0006 et 0007, et vérifiée test par test
dans `tests/dossiers.test.ts`, `tests/cles-dossier.test.ts`, `tests/pieces.test.ts` et
`tests/journal-acces.test.ts`. Cinq points la rendent lisible.

**Le montant et le ratio ne sont pas des colonnes de `dossiers`.** Ils vivent dans `engagements`,
une table que le locataire ne lit pas du tout. Ce n'est pas un filtrage d'affichage : la base ne
lui rend pas la ligne.

**Le journal est la seule colonne où l'on écrit sans pouvoir lire.** Le locataire y inscrit ses
propres consultations et n'y lit rien : voir qu'une pièce a été ouverte lui apprendrait qu'elle
existe. Et personne n'écrit directement dans cette table, quel que soit son rôle. Une fonction
`security definer` renseigne l'acteur d'après le jeton de l'appelant, ce qui rend une entrée
mensongère impossible à fabriquer plutôt qu'improbable.

**Ce que l'agence lit du coffre est inerte.** Elle voit la clé scellée et les octets scellés, et
ni l'une ni les autres ne servent à quoi que ce soit sans la clé maîtresse, qui vit chez Vercel. Lui
cacher le chiffre n'aurait rien ajouté ; ce qui protège, c'est que les deux moitiés ne sont pas
hébergées au même endroit.

**Deux tables disent la même chose de la même pièce.** `pieces` porte les métadonnées,
`storage.objects` porte les octets, et leurs règles sont écrites deux fois volontairement : si elles
divergeaient, la plus permissive des deux deviendrait la règle réelle. La contrainte
`chemin_dans_le_dossier` et la clause `name like dossier_courant()` sont la même phrase, une fois
côté lignes et une fois côté octets.

**`porteur_lien` est un seul rôle Postgres pour le garant et le locataire.** La frontière entre eux
ne peut donc pas venir des droits de table : elle vient du claim `role_partie` porté par le jeton et
lu dans chaque politique. C'est le point le plus facile à oublier en ajoutant une table.

Le cloisonnement est la fonctionnalité, pas une option de confidentialité. Il devra donc être
appliqué **côté serveur**, sur chaque lecture, à partir du rôle porté par la session : jamais par un
filtrage côté client, jamais par une route devinable. Le groupe de routes `app/(marketing)/` existe
depuis le 2 septembre 2026 et isole le site public ; `(app)` naîtra avec le premier espace, en
phase 4, plutôt que d'attendre vide.

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
