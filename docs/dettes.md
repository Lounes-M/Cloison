# Dettes techniques

Ce que l'on sait devoir régler, et qu'on ne règle pas aujourd'hui. Chaque entrée dit **pourquoi**
c'est en attente et **à quel signal** on y revient : une dette sans condition de sortie devient un
oubli.

---

## Bloquées en amont

### ESLint reste en 9.x, ligne non supportée

**Constaté le** 1er septembre 2026, sur la PR Dependabot #3.

ESLint 9 n'est plus supporté en amont (`npm warn deprecated eslint@9.39.5`), mais ESLint 10 casse à
l'exécution :

```
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
```

`eslint-config-next@16.3.4` embarque une version d'`eslint-plugin-react` qui appelle encore
`context.getFilename()`, API supprimée dans ESLint 10. Aucune version de repli n'existe : 9.39.5 est
déjà la dernière 9.x.

Ce n'est pas une faille : ESLint tourne au build et en CI, jamais en production. C'est de
l'outillage figé sur une ligne qui ne recevra plus de correctifs.

**Signal de sortie** : `eslint-config-next` publie une version compatible ESLint 10. Alors : lever la
pause dans `.github/dependabot.yml` et laisser passer la montée.

### TypeScript reste en 6.x

**Constaté le** 1er septembre 2026, sur la PR Dependabot #4.

```
Error: typescript-eslint does not support TS 7.0.
```

Garde-fou explicite de `typescript-eslint`, tiré par `eslint-config-next`. Aucune version de repli :
6.0.3 est déjà la dernière 6.x.

Sans conséquence immédiate (TypeScript 6 est parfaitement fonctionnel) mais l'écart se creusera.

**Signal de sortie** : `typescript-eslint` prend en charge TS 7. Alors : lever la pause dans
`.github/dependabot.yml`.

> Les deux majeures sont mises en pause dans `.github/dependabot.yml`. Sans cela, Dependabot rouvre
> les mêmes PR chaque lundi et le bruit finit par masquer les mises à jour qui comptent.

---

## Décidées, à revoir plus tard

### Les migrations s'appliquent à la main, et rien ne le vérifie

**Constaté le** 3 septembre 2026, en fusionnant la limitation de débit.

Il n'y a ni `supabase/config.toml` ni étape de déploiement : les migrations sont copiées à la main
dans l'éditeur SQL de Supabase. Le dépôt sait donc ce que le schéma **devrait** être, et rien ne
sait ce qu'il **est**.

Ce n'est pas théorique. La migration 0008 crée `consommer_debit`, que le formulaire agence appelle
désormais à chaque envoi. Entre la fusion et son application, le formulaire répond « réessaie dans
quelques minutes » à tout le monde. L'échec est fermé, donc sans fuite, mais un déploiement peut
casser une page en production sans qu'aucun test ni aucune CI ne s'en aperçoive : ils tournent tous
contre PGlite, qui rejoue les migrations depuis zéro et ne peut par construction jamais être en
retard.

**Ce qui ne servirait à rien** : vérifier que les numéros se suivent, ou qu'aucun fichier n'a été
modifié après coup. Ces contrôles sont faciles et ne répondent pas à la question posée, qui est
« qu'est-ce qui est appliqué là-bas ». Un garde-fou qui rassure sans mesurer est pire que pas de
garde-fou.

**Signal de sortie** : le premier déploiement de la phase 4, qui livrera plusieurs migrations d'un
coup au lieu d'une. Alors : le CLI Supabase branché en CI avec un projet de préproduction, de sorte
que `supabase db push` fasse partie du déploiement et que la CI échoue si le schéma diverge. Cela
demande des identifiants Supabase dans les secrets GitHub, ce qui est une décision à prendre et pas
seulement une ligne à écrire.

### La limite de débit ne couvre que nos routes, pas PostgREST

**Constaté le** 3 septembre 2026, en branchant la porte du locataire.

`consommerDebit` est appelée dans nos actions serveur. Mais la clé publiable est, par construction,
publique : n'importe qui peut appeler directement les fonctions accordées à `anon` sur l'API
PostgREST du projet, sans passer par nos routes ni par notre compteur. `ouvrir_dossier_avec_lien`,
`emettre_jeton` et `consommer_debit` elle-même sont dans ce cas.

Ce que ça permet, et ce que ça ne permet pas. Aucune lecture, aucune escalade : la RLS et les
fonctions restent la barrière, et elles tiennent. En revanche, remplir `dossiers` de lignes vides,
ou réémettre le jeton d'un dossier dont on connaîtrait l'uuid, donc révoquer celui du vrai
locataire. L'uuid n'est pas devinable, ce qui borne le second cas à une fuite préalable.

**Ce qui tient en attendant** : les limites propres de Supabase sur son API, et le fait que
`ouvrir_dossier_avec_lien` ne donne rien d'utilisable sans notre signature.

**Signal de sortie** : la revue de sécurité de la phase 5. La parade probable est de faire
consommer le débit **par la fonction SQL elle-même**, à partir d'une empreinte que seule notre clé
sait produire, ce qui rendrait l'appel direct inutile plutôt qu'interdit.

### Une réponse qui dit si une adresse a un dossier

**Constaté le** 1er septembre 2026 par l'[ADR 0006](adr/0006-lien-magique-pour-le-locataire-et-le-garant.md),
et **partiellement réglé le** 3 septembre 2026.

Le magasin partagé, qui était la moitié technique du sujet, existe : la migration 0008 compte dans
Postgres, et `lib/acces/debit.ts` n'y envoie qu'une empreinte. La moitié qui reste est de nature
différente et ne se règle pas dans un compteur.

Un point d'envoi de lien magique doit répondre **exactement la même chose** que l'adresse ait un
dossier ou non : même message, même délai apparent, même code. Sinon la page devient un oracle qui
répond « cette personne est locataire chez nous ». Le compteur ne peut rien pour ça, et il aggrave
même le problème s'il est mal branché : une limite qui ne se déclenche que sur les adresses connues
renseigne à elle seule.

**Signal de sortie** : le parcours locataire, en phase 4. C'est là que la route existera, et la
règle est à écrire avec elle plutôt qu'après.

### Aucun antivirus sur les pièces déposées

**Décidé le** 3 septembre 2026, à l'ouverture du dépôt des pièces.

Le dépôt vérifie le type réel des octets et borne la taille, mais ne fait passer aucun analyseur
antiviral sur ce qui entre. Trois options ont été pesées, et celle qui paraissait la plus simple est
celle qu'il fallait écarter en premier.

**Un service d'analyse externe est exclu, pas reporté.** Il faudrait lui envoyer le bulletin de paie
en clair. Ce serait un sous-traitant de plus au registre, qui verrait précisément ce que l'ADR 0003
s'emploie à cacher à Supabase. Le chiffrement par enveloppe perdrait son sens par la porte de
service.

**ClamAV auto-hébergé tiendrait la promesse, mais ne rentre pas dans une fonction Vercel** : il lui
faut un service séparé, sa base de signatures et sa mise à jour. C'est de l'infrastructure à tenir.

**Ce qui rend l'attente tenable** : personne ne reçoit jamais le fichier d'origine. La rasterisation
de l'ADR 0004 transforme la pièce en images avant qu'elle atteigne l'agence, ce qui détruit le
JavaScript embarqué, les formulaires et les fichiers joints d'un PDF. Ce n'est plus une intention :
`tests/rasterisation.test.ts` construit un PDF portant réellement du `/JavaScript`, l'affirme présent
en entrée, et vérifie qu'il a disparu en sortie, y compris selon `getJSActions()` de pdf.js. Le risque résiduel n'est donc
pas l'agence : c'est notre propre rastériseur, exposé à un fichier hostile. Cela se traite par
l'isolation du décodage, pas par des signatures.

**Signal de sortie** : la revue de sécurité externe de la phase 5. On y arrive avec la question déjà
posée et le raisonnement écrit, plutôt qu'avec une case à cocher. Si la rasterisation devait être
abandonnée ou contournée pour un format, la dette redeviendrait immédiatement bloquante.

### Pas de Content-Security-Policy

Une CSP stricte sous App Router impose des nonces, donc un middleware et un rendu dynamique : on
échangerait des pages entièrement statiques contre cette protection.

**Signal déclenché puis redéfini le 1er septembre 2026.** Le signal initial était « le premier
formulaire en production », et le formulaire agence l'a déclenché. Réexaminé, il était mal choisi :
ce que la CSP atténue avant tout, c'est l'exécution de script injecté dans une page, et le
formulaire n'ouvre aucune surface de ce type : les données saisies partent vers Supabase et un
e-mail, elles ne sont jamais réaffichées sur le site.

**Nouveau signal de sortie** : la première page qui **affiche du contenu fourni par un tiers**,
c'est-à-dire l'espace agence montrant les pièces déposées, en phase 4. C'est là que la surface
apparaît réellement, et le rendu y sera dynamique de toute façon : le coût du nonce disparaît.

---

## Réglées

- **L'en-tête et le pied de page vivaient dans `page.tsx`** : remontés dans le layout racine le
  1er septembre 2026, à l'arrivée de la deuxième route (`/agences`), comme prévu. `app/error.tsx`
  et `app/not-found.tsx` conservent désormais la navigation du site.
- **La limitation de débit vivait en mémoire** : réglée le 3 septembre 2026, comme le signal de
  l'ADR 0006 l'exigeait. La table en mémoire de `lib/agences/action.ts` a disparu au profit de la
  migration 0008, partagée par toutes les instances. Une précision qui n'était pas dans le signal :
  ce qui part vers Supabase n'est jamais l'adresse, mais une empreinte HMAC calculée avec un secret
  qui vit chez Vercel. Qui obtiendrait la table `debits` n'y lirait pas qui a essayé quoi. En
  contrepartie, `CLE_MAITRESSE` devient requise en production, ce qu'elle n'était pas jusque-là.
- **Aucun test automatisé** : réglé le 2 septembre 2026, en ouverture de la phase 3, et le signal
  de sortie était bien celui-là. Le scénario manuel de `supabase/essais/acces-agences.sql` est
  devenu dix-sept tests assertifs qui tournent dans `npm run check` et dans la CI. Un détail du
  signal s'est révélé faux : il annonçait « donner un Postgres dans `ci.yml` ». PGlite embarque
  Postgres dans le processus de test, donc il n'y a ni service à déclarer ni Docker à installer,
  ni en local ni dans la CI. Le harnais a été vu rouge avant d'être livré, en ouvrant volontairement
  la lecture de `demandes_agence` au rôle `anon`.
