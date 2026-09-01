# ADR 0001 — Supabase pour Postgres et le stockage, pas pour l'authentification

**Date** : 1er septembre 2026
**Statut** : acceptée
**Portée** : tâche 16 de la feuille de route, décidée en avance. Contraint partiellement les
tâches 11 (modèle d'accès) et 13 (stockage des pièces), qui restent ouvertes.

## Contexte

Le formulaire de demande des agences a besoin d'un endroit où écrire. La question du stockage se
posait de toute façon pour le produit : autant la trancher sur les critères du produit plutôt que
d'y dériver à cause d'un formulaire de contact.

Cloison fait transiter des bulletins de paie et des avis d'imposition appartenant à des tiers, et sa
promesse tient en une phrase : _personne ne voit ce qu'il ne doit pas voir_. Le choix de plateforme
doit servir cette promesse, pas seulement stocker des lignes.

## Décision

**Supabase, en périmètre restreint.**

| Brique   | Retenue                                | Pourquoi                                                                                                                                                                                                                                                                                                           |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Postgres | **oui**                                | Relationnel, mature, et surtout portable — c'est du Postgres standard, pas un dialecte maison. La donnée part ailleurs avec un `pg_dump`. C'est la brique qui engage le moins.                                                                                                                                     |
| Storage  | **oui**                                | Compatible S3, URLs signées, expiration native. Bon support pour les pièces.                                                                                                                                                                                                                                       |
| RLS      | **oui, et c'est la vraie raison**      | Les règles d'accès sont appliquées par la base, pas par le code applicatif. Pour un produit dont la promesse entière est le cloisonnement, c'est de la défense en profondeur : un bug dans une route ne suffit plus à faire fuiter un montant.                                                                     |
| Auth     | **non** pour le garant et le locataire | La page d'accueil promet « pas de compte ». Le modèle d'accès est _par capacité_ — c'est la possession d'un lien signé qui donne l'accès, pas une identité. Supabase Auth est construit autour de comptes ; le forcer trahirait la promesse ou grefferait des jetons maison sur un système inutilisé par ailleurs. |

Région **UE**, choisie explicitement à la création du projet.

### Comment RLS s'applique sans comptes

C'est le point technique load-bearing de cette décision.

Les politiques RLS s'appuient normalement sur `auth.uid()`. Sans comptes, il faut **signer nos
propres jetons** avec le secret JWT du projet, portant `dossier_id` et `rôle`, et écrire les
politiques contre ces claims. La base refuse alors elle-même de renvoyer un montant à un locataire.

L'alternative — utiliser la clé `service_role` côté serveur et faire les contrôles dans le code
Next — est explicitement **rejetée** : cette clé contourne entièrement RLS, et une seule erreur
d'autorisation exposerait tout, sans filet. Prendre Supabase pour ensuite désactiver sa principale
garantie reviendrait à en payer la complexité sans en acheter le bénéfice.

Conséquence immédiate, appliquée dès la première table : **aucune clé `service_role` n'existe dans
ce dépôt.** Le formulaire agence écrit avec la clé publiable, sur une table dont la politique
n'autorise que l'insertion. Une requête portant cette clé prend le rôle Postgres `anon`, celui que
visent les politiques.

## Ce que cette décision ne tranche pas

**Le chiffrement des pièces.** Supabase chiffre au repos au niveau de l'infrastructure, pas avec une
clé qui t'appartiendrait. La vraie question — _une compromission côté Supabase donne-t-elle des
documents lisibles ?_ — reste ouverte, et sa réponse est du chiffrement applicatif. C'est une
décision distincte de « où sont stockés les fichiers ». Elle appartient toujours à la tâche 13.

**L'authentification des agences.** Une agence est un utilisateur récurrent sur des dizaines de
dossiers ; elle voudra probablement un vrai compte. Supabase Auth aurait alors du sens — pour elle
seule, et sans toucher au modèle par capacité du garant et du locataire. À revoir en phase 4.

## Conséquences

- Un sous-traitant à inscrire au registre RGPD, avec son DPA à signer. Tâche 17.
- Postgres est portable ; Storage et Auth ne le sont pas. On accepte ce couplage sur le stockage
  des fichiers, on l'évite sur l'authentification.
- Les migrations sont versionnées dans `supabase/migrations/`, appliquées dans l'ordre, jamais
  modifiées après application.
- La première table est volontairement à faible enjeu. C'est le bon terrain pour installer les
  gestes — migration versionnée, RLS dès la création, refus par défaut — avant que les tables
  sensibles arrivent. On apprend le geste sur ce qui ne fait pas mal.

## Alternatives écartées

**Neon ou Postgres managé seul** — excellent pour la base, mais il faudrait choisir séparément un
stockage de fichiers avec URLs signées. Supabase apporte les deux avec une cohérence de permissions.

**Tout construire sur Vercel** (Postgres + Blob) — cohérent avec l'hébergement, mais aucun
équivalent de RLS : les règles d'accès resteraient entièrement dans le code applicatif. C'est
précisément ce qu'on cherche à éviter.

**Airtable ou Notion pour les demandes d'agences** — pratique pour la prospection, mais ajoute un
sous-traitant pour un besoin que la base couvre déjà, et n'apporte rien au produit.
