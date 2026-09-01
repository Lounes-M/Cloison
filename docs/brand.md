# Charte Cloison

## Logo

Le logo est **du texte, pas une image** : `CLOI` + une barre CSS + `SON`, en Archivo Black. Il reste
vectoriel à toute taille, pèse 0 Ko et hérite de la couleur de son support.

```tsx
import { Logo } from '@/components/brand/Logo'

<Logo />                        {/* fond clair */}
<Logo variant="inverse" />      {/* fond sombre (encre) */}
<Logo variant="white" />        {/* fond cobalt */}
<Logo className="text-3xl" />   {/* la taille se règle par font-size, uniquement */}
```

La barre jaune est inclinée de 6°. Elle ne change ni de couleur ni d'angle : c'est la cloison, c'est
le seul élément fixe de l'identité.

**Les PNG de `public/brand/` ne servent qu'aux contextes sans HTML** : réseaux sociaux, emails,
presse, documents. Dans le site, on utilise toujours le composant.

## Palette

| Token    | Hex       | Usage                                 |
| -------- | --------- | ------------------------------------- |
| `cream`  | `#fff6e8` | Fond général                          |
| `paper`  | `#ffffff` | Cartes et surfaces posées sur le fond |
| `ink`    | `#141414` | Texte, contours, ombres portées       |
| `cobalt` | `#2b3ef0` | Couleur primaire, CTA principal       |
| `sun`    | `#ffd23f` | Accent du logo, espace **garant**     |
| `flame`  | `#ff5c1f` | CTA secondaire, mise en tension       |
| `mint`   | `#7de08a` | Espace **locataire**                  |
| `sky`    | `#9db8ff` | Espace **agence**                     |
| `live`   | `#1db954` | Pastille d'état vérifié               |
| `muted`  | `#888888` | Texte secondaire                      |

Les trois espaces ont chacun leur couleur — `sun`, `mint`, `sky` — et cette association ne bouge pas.
Un lecteur doit pouvoir identifier de quel côté de la cloison il se trouve à la couleur seule.

## Typographie

- **Archivo Black** (`font-display`) : titres, chiffres, logo. Toujours en capitales.
- **Archivo** (`font-sans`) : tout le reste. Corps de texte en `font-medium` ou `font-semibold` —
  le light n'existe pas dans cette identité.

## Le style « néo-brutaliste »

Trois règles suffisent à reproduire n'importe quel élément du site :

1. **Contour plein** de 2 px en `ink` — utilitaire `outlined`.
2. **Ombre portée décalée, sans flou** — `shadow-brut-sm`, `shadow-brut`, `shadow-brut-lg`.
3. **Réaction au survol** :
   - `press` sur ce qui est cliquable — l'ombre se rétracte, l'élément glisse de 4 px : il s'enfonce.
   - `lift` sur ce qui ne l'est pas — l'ombre se creuse, l'élément se soulève.

Les rotations légères (`rotate-1`, `-rotate-2`) sont volontaires et doivent rester rares : elles
signalent ce qui compte (la règle d'or des tarifs, le tampon « Rescanné. Refait. »).

## Mouvement

Toutes les animations sont déclarées dans `@theme` (`animate-float`, `animate-marquee`,
`animate-spin-slow`, `animate-pulse-dot`, `animate-fade-up`, `animate-wiggle`) et sont neutralisées
sous `prefers-reduced-motion`. Le composant `<Reveal>` respecte la même préférence et laisse le
contenu visible si JavaScript ne s'exécute pas.

## Ton

Tutoiement, phrases courtes, aucun jargon juridique dans le marketing. Le produit parle de gêne, pas
de conformité. La promesse tient en une phrase : _personne ne voit ce qu'il ne doit pas voir_.
