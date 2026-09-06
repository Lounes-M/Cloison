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

### Controle de derive du schema en cours de livraison

**Revu le** 6 septembre 2026, apres PR 47.

Les migrations jusqu'a 0030 ont ete appliquees par lots explicites, avec repetition
transactionnelle et controle distinct des droits reels. Il existe donc des preuves
de rattrapage ; l'ancienne affirmation selon laquelle rien ne verifie le schema
n'est plus exacte. En revanche, la CI reconstruit toujours un schema local : elle
ne prouvait pas une absence de derive ulterieure de Supabase. Le nouveau lot ajoute des empreintes approuvees et un controle horaire ; voir docs/exploitation/derive-schema.md et la PR de livraison avant de considerer ce controle deploye.

**Signal de sortie** : un controle de derive sur un environnement approprie et un
processus de deploiement SQL coordonne avec l'application. Ne pas traiter une CI
locale verte comme une preuve d'application distante et ne pas modifier une
migration deja appliquee.

### Purge physique et restauration a verifier en production

**Revu le** 6 septembre 2026, pendant l'audit.

La migration 0021 remplace la suppression SQL de `storage.objects` par une file
traitee via l'API Storage. Les justificatifs des dossiers signes expirent aussi ;
l'acte signe reste une exception distincte. La route de maintenance et sa reprise
sont deployees avec la PR 43. Un objet fictif chiffre a maintenant ete depose,
relu et supprime via l'API Storage, avec absence des metadonnees et refus a l'origine.
Une copie CDN chiffree a encore ete observee apres suppression : le delai de
propagation ne vaut pas effacement instantane. Voir `docs/exploitation/essais-storage.md`.

La suppression de la cle active ne suffit pas a promettre un effacement definitif :
une sauvegarde peut contenir une ancienne cle de dossier. Le controle des sauvegardes,
leur retention et l'exercice de restauration restent necessaires. La lecture de
l'API Supabase ne liste aucune sauvegarde et indique PITR desactive ; aucune copie
de secours de la cle maitresse n'a ete verifiee.

**Signal de sortie** : verifier sur le service Storage la suppression des octets,
le traitement des echecs et un exercice de restauration documente. Voir
`docs/exploitation/sauvegardes-et-restauration.md` et `docs/audit-suivi.md`.

### Quatre mégaoctets par pièce, pas vingt

**Constaté le** 3 septembre 2026, en construisant le dépôt du garant.

La table `pieces` accepte vingt mégaoctets par fichier. En pratique, le dépôt en accepte quatre.
La raison n'est pas chez nous : Vercel refuse tout corps de requête au-delà de 4,5 Mo, avec une
erreur 413, et c'est vérifié sur sa documentation du 24 août 2026. Or le chiffrement par enveloppe
impose de passer par notre serveur : la seule parade que Vercel documente, l'envoi direct du
navigateur vers le stockage, ferait arriver le fichier en clair chez Supabase, ce que l'ADR 0003
interdit.

**Ce qui rend l'attente tenable** : les photos sont réduites dans le navigateur avant envoi, à deux
mille pixels de côté, ce qui ramène une photo de téléphone sous un mégaoctet. Un PDF de bulletin de
paie dépasse rarement un mégaoctet. La borne haute de la base reste à vingt : c'est elle qui aura
raison le jour où la borne pratique sera levée.

**Signal de sortie** : le premier fichier réel refusé pour sa taille. La parade serait alors le
découpage en morceaux scellés séparément, chacun sous la borne, réassemblés à l'ouverture. Pas
l'envoi direct.

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

**Protection existante** : l'agence recoit une version rasterisee. Le garant peut recuperer
son propre original, apres controle d'acces et journalisation. La rasterisation
de l'ADR 0004 transforme la pièce en images avant qu'elle atteigne l'agence, ce qui détruit le
JavaScript embarqué, les formulaires et les fichiers joints d'un PDF. Ce n'est plus une intention :
`tests/rasterisation.test.ts` construit un PDF portant réellement du `/JavaScript`, l'affirme présent
en entrée, et vérifie qu'il a disparu en sortie, y compris selon `getJSActions()` de pdf.js. Le decodeur reste expose aux fichiers hostiles. Depuis le 6 septembre, il tourne
dans un processus interrompable, sans secrets dans son environnement, avec des limites
de temps, concurrence, pixels et sortie. Il conserve cependant les droits systeme du
compte serveur : ce n'est pas une sandbox et le plafond du tas V8 ne borne pas les
allocations natives. L'isolation systeme et la politique antivirus restent a evaluer.

**Signal de sortie** : la revue de sécurité externe de la phase 5. On y arrive avec la question déjà
posée et le raisonnement écrit, plutôt qu'avec une case à cocher. Si la rasterisation devait être
abandonnée ou contournée pour un format, la dette redeviendrait immédiatement bloquante.

---

## Réglées

- **Pas de Content-Security-Policy** : réglée le 5 septembre 2026, sur le signal redéfini le
  1er septembre, l'espace agence affichant désormais ce que d'autres ont saisi. Deux politiques,
  écrites dans `lib/securite/csp.ts`. Le site public, prérendu, garde `'unsafe-inline'` pour les
  scripts que Next y pose : protection partielle, assumée là où aucun tiers ne saisit rien.
  L'applicatif reçoit du middleware un nonce par requête et `'strict-dynamic'` : un script injecté
  ne porte pas le nonce, il ne s'exécute pas. Le coût prévu s'est confirmé nul, ces pages étant
  déjà rendues à la requête ; seules `/connexion`, `/lien-invalide` et la page 404 sont passées
  en dynamique. Deux surprises en chemin : Next refuse les groupes capturants dans un `source`
  d'en-tête, et zod sonde `new Function` au premier objet validé, ce qu'un `jitless` supprime.
  `tests/csp.test.ts` tient les directives et le fait qu'aucun segment de l'applicatif ne puisse
  tomber, par oubli, sous la politique du site public.
- **Une réponse qui dit si une adresse a un dossier** : réglée le 5 septembre 2026, en
  constatant que le parcours locataire livré en phase 4 avait tenu la règle sans qu'on l'ait
  fermée. La porte `/demarrer` crée un dossier neuf à chaque envoi valide, donc sa réponse ne
  renseigne sur personne, et `tests/porte-locataire.test.ts` le fixe. La connexion agence répond
  « Regarde tes e-mails » que l'adresse ait un compte ou non, erreur Supabase comprise. Il n'existe
  pas de parcours « retrouver mon dossier » ; le jour où il existera, la règle est celle-ci :
  même message, même délai apparent, même code, que l'adresse ait un dossier ou non.
- **La limite de débit ne couvrait que nos routes, pas PostgREST** : réglée le 5 septembre 2026,
  avant le signal prévu, qui était la revue de sécurité. La parade n'est pas celle que la dette
  supposait. Plutôt que de faire compter la fonction SQL elle-même, la migration 0019 retire à
  `anon` les quatre fonctions qui créaient, émettaient ou comptaient (`ouvrir_dossier`,
  `ouvrir_dossier_avec_lien`, `emettre_jeton`, `jeton_est_actif`, `consommer_debit`) et les
  réserve au rôle `serveur`, né avec la 0018. Ce rôle n'existe que par un jeton que nous signons :
  la clé publiable seule ne porte que `anon`, et `anon` n'a plus rien. L'appel direct devient
  impossible plutôt que borné, ce qui est la barrière de l'ADR 0002 appliquée une fois de plus.
  `tests/fonctions-serveur.test.ts` le tient par interdiction, rôle par rôle.
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
