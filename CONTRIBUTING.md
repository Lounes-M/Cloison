# Contribuer à Cloison

## Préparer une modification

Partir de la dernière version de `main`, créer une branche dédiée et préserver les modifications locales existantes. Décrire dans la pull request le problème, le comportement obtenu, les validations et les limites utiles à la revue. Aucun commit direct sur `main`.

Le produit tutoie les locataires et garants et vouvoie les agences. Les textes d'interface vivent dans `lib/content/`. Les couleurs, espacements, ombres et animations utilisent les composants et tokens existants. La typographie du dépôt exclut les emoji et les tirets cadratins.

## Protéger les données

- Le locataire ne consulte ni justificatif ni montant du garant.
- Le garant ne paie pas et reçoit son propre original, sans dégradation.
- La consultation agence exige une identité vérifiée, une MFA et des droits SQL valides ; elle est filigranée et journalisée.
- Une échéance interdit la lecture même si la maintenance est retardée. La conservation de l'acte signé est distincte de celle des justificatifs.
- Une valeur venant du client, un cookie ou un identifiant transmis ne suffit jamais à autoriser une opération.
- Les journaux applicatifs utilisent des libellés constants, sans secret ni donnée personnelle.

Les [ADR](docs/adr/) et les tests de refus définissent les contrats techniques. Un changement de droits ou de cycle de vie doit expliciter ses préconditions, ses effets et les cas de concurrence.

## Valider

```bash
npm ci
npm run check
npm run build
```

Ne pas lancer `check` et `build` simultanément dans le même arbre, ni modifier des fichiers pendant ces contrôles. Les nouvelles routes nécessitent une génération des types Next avant le contrôle TypeScript : `npx next typegen`.

Les tests de sécurité couvrent les interdictions et les erreurs, pas seulement le succès. Vérifier qu'une altération ciblée de la protection fait échouer le test, puis restaurer le code. Une erreur d'import ou de préparation ne constitue pas cette preuve. Les modifications d'interface nécessitent une vérification mobile, ordinateur et clavier.

La CI doit être verte sur la révision proposée avant fusion. Vérifier ensuite la CI de `main`, le déploiement concerné et la supervision. Les essais avec fixtures et les validations fournisseur réelles doivent rester distingués.

## Modifications de données

Une migration déjà appliquée est immuable. Créer une nouvelle migration, documenter le lot et ses préconditions, comparer le schéma attendu, répéter sous transaction avec annulation et vérifier les droits des rôles réels. L'application en production est une opération explicite et coordonnée avec le déploiement applicatif.

Ne jamais supposer qu'une reconstruction locale applique le schéma distant. Consulter les guides de [dérive du schéma](docs/exploitation/derive-schema.md) et de [sauvegarde et restauration](docs/exploitation/sauvegardes-et-restauration.md).

## Secrets et rapports privés

Ne pas versionner les variables de production, clés, capacités d'accès, pièces, exports, sauvegardes ou notes internes. `.env.example` décrit uniquement la configuration attendue. Aucun secret ne porte le préfixe `NEXT_PUBLIC_` et aucun secret n'est injecté dans le bloc `env` de Next.

Les vulnérabilités se signalent selon [SECURITY.md](SECURITY.md), avec des reproductions sur données fictives.
