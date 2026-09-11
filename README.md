# Cloison

[![CI](https://github.com/Lounes-M/Cloison/actions/workflows/ci.yml/badge.svg)](https://github.com/Lounes-M/Cloison/actions/workflows/ci.yml)
[![Secrets](https://github.com/Lounes-M/Cloison/actions/workflows/secrets.yml/badge.svg)](https://github.com/Lounes-M/Cloison/actions/workflows/secrets.yml)

Cloison est une application de gestion de la garantie locative qui sépare les accès du locataire, du garant et de l'agence. Les justificatifs du garant sont chiffrés ; le locataire suit l'avancement sans consulter les pièces ni les montants ; l'agence consulte les documents autorisés avec un filigrane nominatif et une trace d'accès.

[Site du produit](https://www.cloison.immo) · [Documentation](docs/README.md) · [Contribution](CONTRIBUTING.md) · [Sécurité](SECURITY.md)

## Fonctionnalités

- Espaces distincts, liens de capacité pour les porteurs et authentification multifacteur pour l'agence.
- Dépôt chiffré, restitution documentaire, contrôle des accès, expiration et reprise des suppressions.
- Gestion des collaborateurs, affectation des dossiers et historique des changements.
- Demandes de compléments, examen documentaire humain et gestion des modifications concurrentes.
- OCR facultatif via OpenRouter, déclenché explicitement et soumis à des quotas ; les résultats sont à relire.
- Préférences de notifications, rappels facultatifs et suivi des courriels.
- API de statuts pour les intégrateurs, avec clés d'agence révocables.
- Paiement locataire, rapprochement et outils de suivi opérationnel.

Le produit est en préparation de pilote. La chaîne contractuelle Universign et la facturation agence après signature ne sont pas ouvertes de bout en bout. L'OCR ne certifie pas l'authenticité des pièces et ne prend aucune décision sur un dossier. Les [guides d'exploitation](docs/README.md) précisent la portée des fonctionnalités et leurs validations.

## Développement local

Prérequis : Node.js 24 et npm. Les versions de référence sont déclarées dans `.nvmrc` et `package.json`.

```bash
npm ci
```

Copier `.env.example` vers `.env.local`, puis renseigner les variables nécessaires avec des identifiants de développement. Les intégrations facultatives sont décrites dans leurs guides. Utiliser des données fictives et un environnement distinct de la production.

```bash
npm run dev
```

L'application est accessible sur `http://localhost:3000`. Les parcours connectés nécessitent un projet Supabase configuré ; le serveur de développement ne crée pas automatiquement son schéma. Consulter les [règles de déploiement SQL](CONTRIBUTING.md#modifications-de-données).

## Vérifications

| Commande         | Fonction                                                       |
| ---------------- | -------------------------------------------------------------- |
| `npm run check`  | Types, lint, format, typographie, variables publiques et tests |
| `npm run test`   | Tests applicatifs et politiques SQL avec PGlite                |
| `npm run build`  | Build de production et vérification des traces documentaires   |
| `npm run start`  | Exécution du build local                                       |
| `npm run format` | Formatage du dépôt                                             |

Exécuter `check` puis `build` successivement. La CI complète ces contrôles avec PostgreSQL et PostgREST natifs, une restauration de sauvegarde, des parcours Chromium, Firefox et WebKit et un scan de l'historique Git. Les [parcours locaux](docs/exploitation/parcours-navigateur-locaux.md) utilisent des fixtures dédiées.

## Architecture

| Répertoire             | Contenu                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `app/`                 | Site public, espaces applicatifs, routes et actions             |
| `components/`          | Composants d'interface et formulaires                           |
| `lib/`                 | Accès, coffre documentaire, paiements, notifications et contenu |
| `supabase/migrations/` | Migrations PostgreSQL versionnées                               |
| `supabase/essais/`     | Harnais SQL et scénarios de validation                          |
| `tests/`               | Tests métier, sécurité et intégration                           |
| `scripts/`             | Vérifications et outils d'exploitation                          |
| `docs/`                | Architecture, décisions et guides opérationnels                 |
| `public/brand/`        | Ressources publiques de marque                                  |
| `design/logo-kit/`     | Sources du kit graphique                                        |

Next.js et React portent l'application ; PostgreSQL, Supabase Auth et Storage assurent les services de données. Les intégrations sont isolées côté serveur. Voir l'[architecture](docs/architecture.md) et les [décisions techniques](docs/adr/).

## Sécurité et contribution

Toute modification passe par une pull request et les contrôles requis. Les secrets, documents clients, sauvegardes et rapports privés ne doivent pas être ajoutés au dépôt. Utiliser le [signalement privé](SECURITY.md) pour une vulnérabilité.

Le dépôt est consultable publiquement. Aucune licence libre n'est accordée ; `package.json` déclare `UNLICENSED`. Les licences des dépendances et des ressources tierces restent applicables.
