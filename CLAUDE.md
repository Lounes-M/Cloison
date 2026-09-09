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
- **Le deploiement SQL est explicite**, par Lounes ou par l'agent dans le perimetre autorise.
  Une PR qui ajoute des migrations le dit en tete et fournit le lot SQL. Repetition
  transactionnelle, preconditions, CI verte, application puis controle des droits reels.
  Une migration appliquee ne se modifie plus : on en ecrit une nouvelle.
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
  qui vit chez Vercel. Purge des justificatifs a trois mois via maintenance et file Storage ; seuls les actes signes sont conserves.
- **Rasterisation et filigrane nominatif** (ADR 0004) : pdfjs-dist et @napi-rs/canvas, 150 dpi,
  jamais MuPDF, qui est sous AGPL. Le journal `journal_acces` est en écriture seule.
- **Limitation de débit** dans Postgres, par empreintes HMAC dérivées de la clé maîtresse, en
  échec fermé.
- **Content-Security-Policy** en deux formes, `lib/securite/csp.ts` : nonce et `'strict-dynamic'`
  sur l'applicatif par le middleware, statique sur le site public. Un segment applicatif nouveau
  s'ajoute à `SEGMENTS_APPLICATIFS` et au `matcher` du middleware, un test le rappelle.
- **Resend** pour les courriels, **Stripe** Checkout hébergée pour le paiement, importé d'un seul
  fichier, `lib/paiement/stripe.ts`. **Universign** prévu pour la signature (ADR 0005), portail connecte, activation API et modele contractuel pris en charge par Lounes.
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

- `supabase/migrations/` : appliquer dans l’ordre ; voir le suivi de l’audit pour les versions locales et deployees.
- `lib/acces/` sessions, jetons, débit, rôle serveur. `lib/coffre/` dépôt, enveloppe,
  rasterisation, ouverture. `lib/agences/`, `lib/locataire/`, `lib/garant/` les actions de
  chaque acteur. `lib/courriels/` Resend. `lib/content/` tous les textes et les montants.
- `app/(agence)/espace/**`, `app/(porteur)/{locataire,garant}`, `app/(marketing)/demarrer`,
  `app/api/paiement/webhook`.
- `docs/rgpd/` registre, droits, violation. `docs/exploitation/` sauvegardes, revue de sécurité,
  accès anormaux, embarquement d'agence, suivi du pilote. `docs/juridique/` conditions
  générales, brouillon. `docs/dettes.md` ce qu'on doit.

## Etat au 6 septembre 2026, apres PR 53

Le suivi vivant de la remise a niveau est `docs/audit-suivi.md`.
L'audit a rouvert les regles d'acces, les transitions, la purge et plusieurs parcours.
Ne pas presenter les phases 0 a 7 comme terminees. La signature exige encore un
modele contractuel valide et l'integration du compte Universign.

Supabase, Vercel et Stripe CLI sont accessibles depuis le poste de Lounes.
Les PR 43 a 51 sont fusionnees et deployees. La maintenance est verifiee en production. Le rattrapage 0010 a 0013, 0017, puis 0019 a 0030
est applique en production. Les controles de droits ont ete rejoues via l'API publique.
Le domaine canonique est www.cloison.immo ; le domaine sans www redirige en 308.
Le suivi vivant et les limites avant le premier dossier reel sont dans docs/audit-suivi.md.

La passe de validation ajoute `scripts/essai-parcours-local.mjs` (Next/PostgREST),
`verifier-concurrence-depot.mjs`, `verifier-storage-reel.mjs` (fixtures ciblees) et
`sauvegarde-locale.mjs` (export chiffre, extraction uniquement). La migration 0029
reserve le retrait Storage a la maintenance et rend son nettoyage durable.
Voir le suivi d'audit et la PR de livraison pour son application effective.

La PR 46 (a9fedaf) a livre la reservation avant upload et la reprise des depots
interrompus. La migration 0030 est appliquee : ne pas la rejouer. Le parcours coffre
HTTP et une reprise non vide sont verifies en production. Voir la section Etat
courant du suivi d'audit pour distinguer preuves actuelles et historique.

La PR 47 (4b2e50f) a corrige l'independance des phases de maintenance et le cookie
renouvele sur la page MFA. CI main 34020893019 verte ; maintenance non vide
34020976461 verifiee en production. La feuille de route qualifie les preuves
de chaque case ; les parcours Auth, paiement et signature complets restent ouverts.

La PR 48 (bc18cab) impose le contrat des sauvegardes v2, conserve une extraction
v1 explicitement limitee a l'integrite et automatise la restauration PostgreSQL
native en CI. Elle corrige les logs des webhooks Stripe invalides. CI main
34022838275 verte, 466 tests et production verifiee. Aucune restauration de
production ni disponibilite de cle de secours ne sont demontrees.

La PR 49 (06d0e54) exige la confirmation SQL de session_ref avant retour Checkout,
refuse les dates de reprise incoherentes et protege les erreurs de creation Stripe.
CI main 34025975711 verte, 477 tests. Le runbook reprise-paiement distingue les
doubles applicatifs des essais fournisseur ; voir la passe suivante pour le
parcours navigateur de test et les limites de production.

La PR 50 (63d0858) a verifie le paiement navigateur Stripe TEST, avec succes,
refus, annulation et 3D Secure ; webhook fournisseur et base locale. CI main
34028339369 verte, 485 tests. Identite commerciale et configuration Stripe live
restent a confirmer. Voir audit-suivi pour les limites exactes.

Les journaux applicatifs explicites ne recoivent que des libelles constants.
Ne pas ajouter erreur fournisseur, chemin, identifiant, jeton ou donnees saisies
aux appels console. Le test journaux-confidentialite couvre le code applicatif ;
le journal SQL nominatif des acces est distinct. Procedure dans
docs/exploitation/journaux-applicatifs.md.

La PR 51 (fde6fc3) a nettoye les journaux applicatifs explicites et les pannes
du retour Auth ; CI main 34029897926 verte, 512 tests et production verifiee.
Les erreurs de plateforme et traces historiques restent hors de cette preuve.

La PR 52 (aa7701f) a verifie Auth/MFA dans un navigateur avec des comptes fictifs
et le vrai fournisseur, puis corrige la deconnexion accessible et ses pannes.
518 tests dans 61 suites ; reception du lien magique et dernier rendu mobile
restent ouverts. La livraison est documentee dans la PR 52.

Le lot 53 ajoute une supervision agregee et une photographie du pilote sur
28 jours. La migration 0031 exige une application explicite ; consulter la PR
et docs/exploitation/supervision-deploiement.md pour son etat reel. Les alertes
sont des echecs de workflow GitHub, pas une preuve de reception humaine.

La PR 53 (2783ede) est fusionnee et deployee. La migration 0031 est appliquee,
apres repetition transactionnelle et CI de PR verte. Ne pas la rejouer.
Le workflow Supervision 34039463089 est vert en production, compteurs a zero.
556 tests dans 64 suites avant le lot filigrane. Voir la PR pour la CI main.

La PR 55 (bff673b) corrige une police implicite absente sur Vercel. Le filigrane
utilise une police embarquee explicite ; les traces de build verifient des pixels.
Le PDF de production est inspecte avec marquage visible, acces AAL2 et refus
inter-agences verifies, fixtures nettoyees. 560 tests dans 66 suites sur ce lot.
La detection du schema ajoutee ensuite exige deux references revues explicitement ;
voir docs/exploitation/derive-schema.md avant toute future migration SQL.

La PR 56 (d298674) est fusionnee et deployee, CI main 34043063293 verte.
0032 est appliquee et immuable ; empreintes de schema locales et Supabase
versionnees, droits reels verifies. 601 tests dans 69 suites. Supervision
34043331193 verte apres acquittement de cinq entrees de purge sans objet restant.
La cadence cron GitHub est indicative ; plusieurs heures entre executions observees.
Le lot suivant aligne la presentation publique sur le pilote : ne pas presenter
la signature comme ouverte ni le ratio declare comme une verification des pieces.

Etat verifie au 9 septembre : origin/main 7b51df4 (PR86), migration 0043 appliquee,
empreinte distante conforme et schema net non expose. Voir la section courante
de docs/audit-suivi.md et docs/implementation-audit-septembre.md. PR87 reprise
sur ce main ; 0044 non appliquee. GitHub Actions est bloque avant les jobs pour
facturation : ne pas fusionner sans CI finale verte.
Le calendrier Supabase continue, confirmation applicative recente verifiee.
