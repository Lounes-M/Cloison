# Cloison

Le coffre à trois clés pour la garantie locative. Le garant dépose ses pièces dans un coffre que
le locataire ne voit jamais ; l'agence les consulte filigranées à son nom, avec le ratio de
solvabilité, et fait signer l'acte. Site en production sur `https://cloison.immo`, domaine acheté le
5 septembre 2026 ; `cloison.fr` et `cloison.com` sont à acquérir plus tard, `cloison.fr` étant pris.

Ce fichier est ce qu'une nouvelle session doit savoir pour continuer sans relire l'historique.
La feuille de route complète, cinquante tâches en neuf phases, est dans
`docs/feuille-de-route.md` : c'est elle qu'on lit et qu'on met à jour à chaque tâche livrée. Sa
version d'origine vit dans un artefact Claude :
`https://claude.ai/code/artifact/64a581c3-18ff-4255-86ac-735d5523dc7e`.

## Comment travailler avec Lounes

- **En français, en le tutoyant.** Le produit tutoie le locataire et le garant, vouvoie l'agence.
- **Tout passe par une PR**, jamais de commit direct sur `main` : Vercel la déploie à chaque
  push. Branche, PR avec le gabarit du dépôt rempli, CI verte, puis **fusionner soi-même** en
  squash avec suppression de la branche, vérifier la CI sur `main`, et **enchaîner sur la tâche
  suivante sans demander**. Signaler dans le message de PR ce qui mérite un regard, personne ne
  relit avant la fusion.
- **Les migrations s'appliquent à la main**, par Lounes, dans l'éditeur SQL de Supabase. Une PR
  qui en ajoute une le dit en tête et fournit le SQL à coller. Une migration appliquée ne se
  modifie plus : on en écrit une nouvelle.
- **Ni emoji, ni tiret cadratin**, nulle part : `npm run check:typo` le vérifie.
- **Aucun secret derrière `NEXT_PUBLIC_`**, aucune clé `service_role` ou `sb_secret_` dans le
  code ni dans la conversation. Refuser si elle est proposée. Le serveur n'a que la clé
  publiable et signe lui-même ses jetons.
- **Sabotage avant livraison** : chaque garde, politique ou test est vu rouge une fois avant
  d'être livré. Les tests d'accès s'écrivent par interdiction : « le locataire ne peut pas lire
  un montant », pas « l'agence peut lire un montant ».
- **Antivirus reporté**, décidé le 4 septembre 2026 : la rasterisation neutralise le contenu
  actif. Inscrit dans `docs/dettes.md`.

## Sept règles qui ne se négocient pas

1. Le garant ne paie jamais. Aucun parcours, aucun écran, aucune exception.
2. Le locataire ne voit ni une pièce, ni un montant. Seulement un statut.
3. Le garant ne voit jamais ses propres pièces dégradées : le filigrane s'applique à la sortie
   vers l'agence.
4. La mention de cautionnement n'est jamais pré-remplie ni suggérée.
5. Toute lecture vérifie le rôle côté serveur. Jamais un filtrage client, jamais une route
   devinable.
6. Une pièce à échéance est détruite, pas masquée. L'acte signé est la seule exception.
7. Tout accès à une pièce laisse une trace nominative, en écriture seule.

`tests/invariants.test.ts` en tient quatre par lecture du code source ; les autres par PGlite.

## La pile, et les décisions qui la portent

Les six ADR de `docs/adr/` sont la référence ; `docs/architecture.md` les relie.

- **Next.js 16 App Router**, routes typées (`npx next typegen` après une route nouvelle), groupes
  `(marketing)`, `(agence)`, `(porteur)`. Actions serveur avec `useActionState`. Corps de requête
  plafonné à 4,5 Mo par Vercel, donc 4 Mo par pièce et réduction des images côté client.
- **Supabase** Postgres, Storage, Auth pour l'agence seulement, par lien magique et par domaine
  e-mail. Clé publiable uniquement. `getUser()`, jamais `getSession()`.
- **La barrière est le rôle Postgres** (ADR 0002) : `anon`, `authenticated` pour l'agence,
  `porteur_lien` pour le locataire et le garant par jeton de capacité, `serveur` pour ce que le
  serveur fait seul : webhook de paiement, ouverture d'un dossier, jetons, débit. `anon` n'appelle
  plus aucune fonction. Une politique `to authenticated` est inatteignable par un porteur de lien.
- **Jetons de capacité** : JWT HS256 signé avec `SUPABASE_JWT_SECRET`, cookie `cloison_capacite`
  HttpOnly, révocation par `jetons_actifs`. Le lien est réémissible, le jeton non.
- **Chiffrement par enveloppe** (ADR 0003) : une clé par dossier, scellée par `CLE_MAITRESSE`
  qui vit chez Vercel. Purge à trois mois par pg_cron, actes signés exceptés.
- **Rasterisation et filigrane nominatif** (ADR 0004) : pdfjs-dist et @napi-rs/canvas, 150 dpi,
  jamais MuPDF, qui est sous AGPL. Le journal `journal_acces` est en écriture seule.
- **Limitation de débit** dans Postgres, par empreintes HMAC dérivées de la clé maîtresse, en
  échec fermé.
- **Content-Security-Policy** en deux formes, `lib/securite/csp.ts` : nonce et `'strict-dynamic'`
  sur l'applicatif par le middleware, statique sur le site public. Un segment applicatif nouveau
  s'ajoute à `SEGMENTS_APPLICATIFS` et au `matcher` du middleware, un test le rappelle.
- **Resend** pour les courriels, **Stripe** Checkout hébergée pour le paiement, importé d'un seul
  fichier, `lib/paiement/stripe.ts`. **Universign** prévu pour la signature (ADR 0005), compte
  non ouvert.
- **Tarifs** décidés le 4 septembre 2026 : 9 € une fois pour le locataire, avant le lien du
  garant, sans remboursement ; 29 € par acte signé pour l'agence, collaborateurs illimités et
  gratuits. Les montants vivent dans `lib/content/tarifs.ts`.

## Commandes et pièges

```bash
npm run check    # typecheck, lint, format, typo, variables publiques, tests PGlite
npm run build
```

- La suite dure six à sept minutes. **Ne jamais lancer `check` et `build` en parallèle** :
  `TS6053` sur `.next/types`. **Ne rien écrire dans le dépôt pendant `check`** : `format:check`
  et `check:typo` balaient tout.
- Une tâche en arrière-plan annonce « exit code 0 » quel que soit le résultat : lire la ligne
  `EXIT=` écrite dans le fichier de sortie.
- Les tests tournent sur PGlite avec `supabase/essais/harnais-supabase.sql`, qui imite
  `auth`, `storage` et les rôles. `fileParallelism` est désactivé.
- Le déclencheur de la 0002 remet une agence en `decouverte` si le SIREN change dans le même
  ordre : vérifier une agence en deux ordres SQL.
- La preview Vercel est protégée par une connexion : vérifier en production.

## Variables d'environnement

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWT_SECRET`, `CLE_MAITRESSE`,
`RESEND_API_KEY`, `EMAIL_DESTINATAIRE`, `EMAIL_EXPEDITEUR` sur le domaine vérifié,
`EMAIL_SUPPORT` optionnelle, `NEXT_PUBLIC_SITE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
Détail dans `.env.example`.

## Où sont les choses

- `supabase/migrations/` 0001 à 0019 ; 0001 à 0018 appliquées en production au 4 septembre 2026,
  la 0019 attend son application.
- `lib/acces/` sessions, jetons, débit, rôle serveur. `lib/coffre/` dépôt, enveloppe,
  rasterisation, ouverture. `lib/agences/`, `lib/locataire/`, `lib/garant/` les actions de
  chaque acteur. `lib/courriels/` Resend. `lib/content/` tous les textes et les montants.
- `app/(agence)/espace/**`, `app/(porteur)/{locataire,garant}`, `app/(marketing)/demarrer`,
  `app/api/paiement/webhook`.
- `docs/rgpd/` registre, droits, violation. `docs/exploitation/` sauvegardes, revue de sécurité,
  accès anormaux, embarquement d'agence, suivi du pilote. `docs/juridique/` conditions
  générales, brouillon. `docs/dettes.md` ce qu'on doit.

## État au 5 septembre 2026

Quarante PR fusionnées. Les phases 0 à 7 de la feuille de route sont livrées côté dépôt.
Resend est configuré avec un domaine vérifié. Stripe est en cours de création par Lounes.

Le 5 septembre, depuis une session cloud : la feuille de route est entrée dans le dépôt, la
migration 0019 a retiré à `anon` toute fonction au profit du rôle `serveur`, la
Content-Security-Policy est posée, et l'espace agence affiche l'adresse de support dès qu'elle
existe. Trois dettes fermées : PostgREST, CSP, réponse oracle.

Ce qui reste ne se code pas, et se fait de son côté :

0. **Appliquer la migration 0019** dans l'éditeur SQL de Supabase, avant tout : sans elle, la
   porte du locataire, les liens et le compteur de débit répondent « réessaie » à tout le monde.
1. **Rattacher `cloison.immo`** : Vercel, Settings puis Domains, avec `www` redirigé vers l'apex,
   les deux enregistrements DNS chez le registrar, puis redéployer. Ensuite, dans l'ordre : Supabase,
   Authentication puis URL Configuration, ajouter `https://cloison.immo/connexion/verifie` et
   passer le Site URL dessus ; Resend, vérifier `cloison.immo` comme domaine d'envoi et passer
   `EMAIL_EXPEDITEUR` sur `Cloison <bonjour@cloison.immo>` ; Stripe, déclarer le webhook sur
   `https://cloison.immo/api/paiement/webhook` ; une redirection de `support@cloison.immo` vers
   ta boîte, puis `EMAIL_SUPPORT`. Rien à changer dans le code : l'URL du site se déduit du domaine
   de production Vercel.
2. Stripe : clés dans Vercel, webhook `/api/paiement/webhook` sur `checkout.session.completed`,
   redéploiement, puis un tour avec la carte de test. Vérifier ensuite les journaux du webhook.
3. pg_cron : activer l'extension et planifier la purge, SQL dans
   `docs/exploitation/sauvegardes-et-restauration.md`.
4. Région Vercel des fonctions en Europe, `fra1`.
5. Une restauration réellement effectuée, datée dans le document.
6. Un conseil pour ce qui est marqué Juridique : conditions générales, registre, accord de
   traitement, mentions légales, modèle d'acte.
7. La revue de sécurité externe, périmètre dans `docs/exploitation/revue-de-securite.md`.
8. Le compte Universign, qui débloque la signature (tâche 34) puis l'encaissement à l'acte (43).
9. L'adresse de support à fixer, puis à poser dans Vercel sous `EMAIL_SUPPORT` : l'espace agence
   l'affiche et les courriels y répondent dès qu'elle existe.
10. Le jour du point hebdomadaire et l'endroit du compte rendu.

Ce qui reste à coder, quand ces comptes existeront : la signature électronique de l'acte, la
facturation effective des actes, et la phase 8, un deuxième
cas d'usage, pas avant que la location tourne seule.
