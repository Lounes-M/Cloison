# Kit de marque Cloison

Charte de novembre 2026 : Poppins, vert `#035946`, orange `#fe5000`, rose `#edb8d5`, crème
`#faf4ec`, encre `#1e1e1e`. Le logo garde sa forme (CLOI, barre inclinée de 6°, SON) ; la barre
est orange et n'a plus de contour.

Sur le site, le logo reste du texte (`components/brand/Logo.tsx`). Les fichiers ci-dessous servent
partout où le HTML n'est pas possible : réseaux sociaux, courriels, presse, documents. Les lettres
y sont vectorisées : aucun fichier ne dépend de la police installée.

## Ce que contient le kit

### Logo (`public/brand/`, chaque fichier en SVG et en PNG)

| Fichier                    | Fond        | Lettres | Barre  | Usage                           |
| -------------------------- | ----------- | ------- | ------ | ------------------------------- |
| `cloison-primaire`         | crème       | encre   | orange | Version par défaut              |
| `cloison-transparent`      | transparent | encre   | orange | Sur fond clair quelconque       |
| `cloison-vert`             | vert        | crème   | orange | Fond de marque                  |
| `cloison-rose`             | rose        | encre   | orange | Sections rose, supports festifs |
| `cloison-inverse-noir`     | noir        | crème   | orange | Fond très sombre                |
| `cloison-blanc`            | transparent | blanc   | orange | Sur photo ou fond sombre        |
| `cloison-monochrome`       | transparent | encre   | encre  | Impression une couleur, tampon  |
| `cloison-monochrome-blanc` | transparent | blanc   | blanc  | Gravure, impression en réserve  |
| `cloison-baseline`         | crème       | encre   | orange | Logo et signature, en-têtes     |
| `cloison-baseline-vert`    | vert        | crème   | orange | Idem sur fond de marque         |

Zone de protection : laisser autour du logo au moins la hauteur de la barre. Taille minimale :
80 px de large à l'écran, 20 mm à l'impression ; en dessous, utiliser le symbole.

### Symbole et icônes

- `public/brand/cloison-symbole.svg` / `.png` (1024 px) : la barre orange sur un carré vert
  arrondi. C'est aussi `app/icon.svg` et `public/brand/cloison-favicon.svg`.
- `public/brand/cloison-symbole-plein.svg` et `cloison-avatar.png` (1024 px) : même dessin à fond
  perdu, pour les photos de profil (les réseaux découpent eux-mêmes en rond ou en carré).
- `app/favicon.ico` (16, 32, 48 px), `app/apple-icon.png` (180 px, sans transparence),
  `public/icones/icone-{16,32,48,192,512}.png` et `icone-masquable-512.png` pour le manifeste
  (`app/manifest.ts`). Next déclare tout cela dans le `<head>` sans autre code.

### Partage

- `app/opengraph-image.tsx` (et `twitter-image.tsx`) : l'image de partage 1200 × 630, générée à la
  demande, en Poppins et aux couleurs de la charte.
- `public/brand/cloison-partage.png` : la même image figée, pour un usage hors du site
  (présentation, dossier de presse, publication manuelle).

### Intégration HTML

`cloison-logo.html` (ce dossier) : snippet copier-coller du logo en HTML et CSS, pour un site ou
un outil tiers (page d'atterrissage, outil d'emailing qui accepte le HTML).

## Régénérer

Après un changement de couleur ou de géométrie, depuis la racine du dépôt :

```sh
pip install fonttools uharfbuzz
python3 scripts/marque/generer-svg.py   # SVG maîtres, app/icon.svg
node scripts/marque/rasteriser.mjs      # PNG, ICO, icônes d'application
```

Le second script utilise le Chromium de Playwright ; `CHROMIUM_PATH` permet d'en désigner un
autre. Les polices sont dans `assets/fonts/` (Poppins, licence SIL OFL, voir `Poppins-OFL.txt`).
