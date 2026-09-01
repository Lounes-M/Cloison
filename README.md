# Cloison

> Le coffre à trois clés.

Cloison prend la caution locative de A à Z. Le garant dépose ses pièces chez lui, le locataire voit
un feu vert, l'agence signe. **Personne ne voit ce qu'il ne doit pas voir.**

Ce dépôt contient aujourd'hui le site public (landing) et les fondations techniques du produit.

---

## Démarrer

```bash
npm install
npm run dev
```

Le site tourne sur http://localhost:3000.

Node ≥ 20.9 est requis (voir `.nvmrc`).

## Scripts

| Commande            | Effet                                                  |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Serveur de développement (Turbopack)                   |
| `npm run build`     | Build de production                                    |
| `npm run start`     | Sert le build de production                            |
| `npm run typecheck` | TypeScript en mode strict, sans émission               |
| `npm run lint`      | ESLint (`--fix` avec `npm run lint:fix`)               |
| `npm run format`    | Prettier en écriture (`format:check` en lecture seule) |
| `npm run check`     | Les trois vérifications de la CI d'un coup             |

Avant de pousser : `npm run check`.

## Stack

- **Next.js 16** (App Router, React Server Components, Turbopack)
- **React 19** · **TypeScript** en `strict` + `noUncheckedIndexedAccess`
- **Tailwind CSS 4** — tokens déclarés en CSS dans `app/globals.css`
- **ESLint** (`next/core-web-vitals` + `next/typescript`) et **Prettier**

## Organisation

```
app/                  Routes App Router, métadonnées, favicon, image Open Graph
components/
  brand/              Logo et éléments d'identité
  layout/             En-tête et pied de page du site
  sections/           Une section de la home = un fichier
  ui/                 Primitives réutilisables (Button, Badge, Reveal, Section…)
lib/
  content/home.ts     Tout le texte de la home, séparé de la mise en forme
  site.ts             Config globale (nom, URL, navigation)
  utils.ts            `cn()` — fusion de classes Tailwind
assets/fonts/         Archivo Black en TTF, lu au build pour l'image Open Graph
public/brand/         Déclinaisons PNG du logo (réseaux sociaux, presse, emails)
design/               Sources de design non buildées (artifact d'origine, kit logo)
docs/                 Charte de marque et notes d'architecture
```

Deux règles qui font gagner du temps :

1. **Le texte vit dans `lib/content/`**, pas dans les composants. Modifier une accroche n'implique
   jamais d'ouvrir un fichier `.tsx`.
2. **Les couleurs, ombres et animations vivent dans `app/globals.css`**, sous `@theme`. Aucune valeur
   hexadécimale en dur dans un composant.

Voir [`docs/brand.md`](docs/brand.md) pour la charte et [`docs/architecture.md`](docs/architecture.md)
pour la suite prévue.

## Déploiement

Le projet est prêt pour Vercel : importer le dépôt, définir `NEXT_PUBLIC_SITE_URL` sur le domaine de
production (voir `.env.example`), déployer. Aucune autre variable n'est nécessaire pour l'instant.
