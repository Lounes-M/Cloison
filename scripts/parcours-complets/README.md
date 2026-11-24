# Parcours complets

Les parcours d'une agence, d'un locataire et d'un garant, de la première connexion
au modèle d'acte, dans un vrai navigateur, sur le build de production et un
Supabase local complet (Postgres, Auth, PostgREST, Storage, boîte aux lettres).

Ils complètent les harnais existants (`scripts/essai-parcours-local.mjs`,
`scripts/verifier-navigateur-ocr.mjs`), qui posent les sessions et les pièces en
fixtures SQL. Ici rien n'est posé à la main : la session naît du lien reçu par
courriel et du second facteur, les pièces passent par le vrai dépôt et le vrai
Storage, les liens du locataire et du garant sont lus dans les courriels envoyés.

## Lancer

Docker doit tourner.

```sh
npx supabase@3.3.0 start -x studio,realtime,edge-runtime,logflare,vector,imgproxy,postgres-meta,supavisor
NEXT_PUBLIC_SITE_URL=https://localhost:3443 npm run build
npx playwright install chromium
node scripts/parcours-complets/parcours.mjs
```

`supabase start` lit `supabase/config.toml` et applique `supabase/migrations` dans
l'ordre. Ce fichier ne décrit que le Supabase local : gabarit du courriel de
connexion, TOTP activé, adresse du site du harnais. Le projet hébergé se règle
toujours dans son tableau de bord.

Variables utiles :

| Variable                | Effet                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| `PARCOURS_SEULEMENT`    | une seule combinaison : `fr-ordinateur`, `en-mobile`, etc.       |
| `PARCOURS_PARCOURS`     | une partie des parcours : `simple`, `colocation`, `incidents`    |
| `PARCOURS_CAPTURES`     | dossier où ranger une capture de chaque étape, et les PDF rendus |
| `PARCOURS_CHROMIUM`     | chemin d'un Chromium déjà installé                               |
| `PARCOURS_JOURNAL_NEXT` | recopie le journal du serveur Next sur la sortie d'erreur        |

Chaque passage crée ses propres agences et ses propres adresses : la base n'a pas
à être vide et deux passages ne se gênent pas. `npx supabase db reset` repart de
zéro.

`node scripts/parcours-complets/environnement.mjs` démarre seulement
l'environnement (site sur `https://localhost:3443`), pour explorer à la main. Les
courriels applicatifs se lisent alors sur `http://127.0.0.1:3460/_courriels`, ceux
d'Auth sur `http://127.0.0.1:54324`.

## Ce qui est exercé

Quatre combinaisons : français et anglais, 1280 et 390 pixels. La langue choisie
est celle de l'agence, du locataire et du garant, courriels compris.

Parcours simple (`parcours-simple.mjs`) :

- l'agence se connecte par le lien du courriel d'Auth (vrai gabarit, sujet dans la
  bonne langue), configure son second facteur TOTP, nomme son espace ;
- elle demande son activation ; le contrôle du SIREN figure au courriel de
  l'exploitant, et la requête SQL que ce courriel donne est exécutée telle quelle ;
- elle ouvre un dossier avec un loyer ; le locataire suit son lien, retrouve le
  loyer, désigne son garant ;
- le garant suit son lien, déclare son engagement, dépose quatre pièces (un PDF de
  trois bulletins, un avis, deux photos d'identité réunies en un PDF dans le
  navigateur, une photo de facture réduite), écrit sa mention ;
- l'agence ouvre chaque pièce filigranée (quatre lignes au journal), lance la
  comparaison IA du revenu déclaré aux pièces (3 000 € déclarés, 2 400 € lus,
  écart de 25 % signalé), marque les pièces examinées, télécharge la synthèse pour
  le bailleur (inscrite au journal), prend le dossier, remplit et télécharge le
  modèle d'acte, dont le texte est relu ;
- le locataire et le garant voient le dossier pris, dépôt fermé.

Parcours colocation (`parcours-colocation.mjs`) : trois colocataires sur un bail
solidaire à 1 500 €, deux d'entre eux avec le même garant.

- deux dossiers pour trois colocataires, chacun au loyer entier ;
- un colocataire ne voit ni l'adresse ni le dossier des autres, son garant non plus ;
- solvabilité commune : le premier garant terminé (2,00 fois le loyer), le dossier
  reste « dépôt en cours » ; le second (retraité, 1,33) termine, les deux dossiers
  deviennent complets ensemble ; la fiche de la colocation affiche 3,33 ;
- l'acte du garant commun nomme les deux colocataires qu'il garantit, pas le
  troisième.

Parcours des incidents (`parcours-incidents.mjs`) :

- un garant à deux fois le loyer : dossier jugé insuffisant ;
- le locataire désigne un second garant, qui ne voit rien du premier ; leurs
  revenus s'additionnent et le dossier devient complet ;
- l'agence demande le remplacement d'une pièce ; le garant est prévenu par
  courriel au passage de la maintenance, dépose la nouvelle pièce et la propose ;
  l'agence la valide et le dossier redevient complet ;
- l'agence retrouve le dossier par sa référence, puis le refuse ; le locataire est
  prévenu par un courriel qui ne dit rien des revenus, et son espace se ferme.

Les courriels de statut ne partent qu'au passage de `/api/maintenance` : le
parcours l'appelle avec le secret du planificateur, comme en production, et exige
un bilan sans échec (purge, liens, notifications, rappels, distribution).

Sur chaque page capturée : aucune erreur de script, aucune réponse 5xx, aucune
requête hors du site, aucun débordement horizontal, et en anglais aucun mot
manifestement français.

Les mutations sont vérifiées dans Postgres, pas seulement à l'écran.

## Ce qui est faux, et pourquoi

Le code de production appelle ses fournisseurs à des adresses écrites en dur. Le
harnais charge `prechargement.mjs` dans le processus Next (`NODE_OPTIONS=--import`)
pour détourner `fetch` vers `faux-fournisseurs.mjs`, sur la boucle locale, et
refuser tout autre hôte extérieur. Aucun code applicatif n'est modifié pour cela.

- Resend : les courriels sont gardés en mémoire (`RESEND_BASE_URL`, prévue par le
  SDK). Rien n'est envoyé.
- OpenRouter : la lecture des revenus rend trois bulletins au net programmé par le
  parcours, ou une pension. Aucun modèle n'est interrogé.
- L'annuaire des entreprises : toujours la même agence, en activité.

Le site est servi en HTTPS par `serveur-next.mjs`, avec un certificat généré pour
un jour : les cookies de session sont `secure` et la CSP porte
`upgrade-insecure-requests`. Seule la confiance dans ce certificat est contournée.

## Limites

- La signature électronique (Docage), le règlement des actes et Stripe ne sont pas
  joués : le parcours s'arrête au modèle d'acte téléchargé. Le paiement du
  locataire sans agence et son remboursement au prorata restent couverts par leurs
  propres essais.
- Chromium seulement. Les trois moteurs restent ceux du job « Interface ».
- Le saut d'Auth vers le site (`/auth/v1/verify`) est suivi par le harnais et non
  par le navigateur, qui refuse le HTTP simple de l'API locale sur un hôte déjà vu
  en HTTPS strict.
- Les largeurs réduites ne sont pas des essais sur appareil physique. La détection
  du français en page anglaise est une liste de mots, pas une relecture.
