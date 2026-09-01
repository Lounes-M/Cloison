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

Node 24 est requis (voir `.nvmrc`). C'est la version par defaut de Vercel et celle de la CI ;
`engines.node` est fige sur `24.x` pour qu'aucune des trois ne derive toute seule.

## Scripts

| Commande            | Effet                                                  |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Serveur de développement (Turbopack)                   |
| `npm run build`     | Build de production                                    |
| `npm run start`     | Sert le build de production                            |
| `npm run typecheck` | TypeScript en mode strict, sans émission               |
| `npm run lint`      | ESLint (`--fix` avec `npm run lint:fix`)               |
| `npm run format`    | Prettier en écriture (`format:check` en lecture seule) |
| `npm run check:env` | Vérifie qu'aucun secret ne peut partir vers le client  |
| `npm run check`     | Toutes les vérifications de la CI d'un coup            |

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
  agences/            Schéma de validation et enregistrement des demandes
  content/            Tout le texte des pages, séparé de la mise en forme
  env.ts              Variables serveur, jamais exposées au navigateur
  site.ts             Config globale (nom, URL, navigation)
  utils.ts            `cn()` — fusion de classes Tailwind
supabase/migrations/  Schéma SQL versionné, appliqué dans l'ordre
scripts/              Garde-fous exécutables (fuite de secrets…)
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

Voir [`docs/brand.md`](docs/brand.md) pour la charte, [`docs/architecture.md`](docs/architecture.md)
pour la suite prévue, [`docs/dettes.md`](docs/dettes.md) pour ce qu'on sait devoir régler plus tard,
et [`docs/adr/`](docs/adr) pour les décisions d'architecture et leurs raisons.

## Déploiement

Hébergement cible : Vercel. Le dépôt est prêt, et **il n'y a aucune variable d'environnement à
saisir**.

1. **Importer le dépôt** sur [vercel.com/new](https://vercel.com/new). Le dépôt étant privé, pense à
   autoriser explicitement `Lounes-M/Cloison` quand Vercel demande l'accès à GitHub. Next.js est
   ensuite détecté seul : ne touche ni à la commande de build ni au répertoire de sortie.
2. **Déployer.**
3. **Brancher le domaine** dans Settings → Domains quand tu l'auras, puis **redéployer**.

### D'où vient l'URL du site

`site.url` est résolue au build dans [`next.config.ts`](next.config.ts), dans cet ordre :

| Priorité | Source                          | Quand                               |
| -------- | ------------------------------- | ----------------------------------- |
| 1        | `NEXT_PUBLIC_SITE_URL`          | seulement si tu la définis toi-même |
| 2        | `VERCEL_PROJECT_PRODUCTION_URL` | sur Vercel, automatiquement         |
| 3        | `http://localhost:3000`         | en développement                    |

`VERCEL_PROJECT_PRODUCTION_URL` est le domaine de production le plus court du projet : le
`.vercel.app` tant qu'aucun domaine personnalisé n'est rattaché, **puis le domaine personnalisé dès
qu'il l'est**. C'est pour cela qu'il n'y a rien à saisir, ni au premier déploiement ni le jour du
domaine — il suffit de redéployer pour que les métadonnées suivent.

Cela suppose que **« Enable access to System Environment Variables »** reste coché dans
Settings → Environment Variables (c'est le réglage par défaut). Si tu le décoches, l'URL retombe sur
`localhost` et le sitemap devient faux.

Après la mise en ligne, vérifie que `https://<domaine>/sitemap.xml` et `/robots.txt` citent bien le
domaine de production, et passe l'URL dans un validateur d'aperçu social pour contrôler l'image
Open Graph.

### Variables d'environnement et secrets

Deux mécanismes exposent une variable au navigateur sous Next : le préfixe `NEXT_PUBLIC_`, et le
bloc `env` de [`next.config.ts`](next.config.ts). Les deux **substituent la valeur au build** — elle
devient lisible par n'importe qui dans le code source de la page. Rien ne signale l'erreur, le site
fonctionne parfaitement.

`npm run check:env` rend la règle opposable plutôt que déclarative. Il vérifie que :

1. le bloc `env` ne contient que des clés explicitement autorisées ;
2. aucune variable `NEXT_PUBLIC_*` du code ne porte un nom de secret ;
3. aucune valeur de variable sensible de l'environnement ne se retrouve dans les fichiers servis au
   navigateur.

La troisième est la seule qui constate une fuite réelle : elle a besoin d'un build, et la CI la
rejoue donc après l'étape de build.

**Un secret ne porte jamais le préfixe `NEXT_PUBLIC_` et ne passe jamais par le bloc `env`.** Il se
lit côté serveur via `process.env`. Rendre une nouvelle valeur publique est une décision explicite :
il faut l'ajouter à `CLES_PUBLIQUES_AUTORISEES` dans
[`scripts/verifie-variables-publiques.mjs`](scripts/verifie-variables-publiques.mjs).

### En-têtes de sécurité

Ils sont déclarés dans [`next.config.ts`](next.config.ts) et s'appliquent à toutes les réponses.

`Strict-Transport-Security` est envoyé avec `preload` : **n'ajoute le domaine à la liste de
préchargement HSTS qu'une fois certain de rester en HTTPS**, l'opération étant longue à défaire.
L'en-tête seul est sans risque.

Il n'y a volontairement **pas de Content-Security-Policy** pour l'instant : sous App Router, une CSP
stricte impose des nonces, donc un middleware et un rendu dynamique. On échangerait aujourd'hui des
pages entièrement statiques contre une protection sans objet, le site ne recevant aucune donnée.
À trancher avec le socle produit, quand les premiers formulaires arriveront.
