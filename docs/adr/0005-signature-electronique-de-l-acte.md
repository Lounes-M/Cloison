# ADR 0005 — Signature électronique de l'acte de cautionnement

**Date** : 1er septembre 2026
**Statut** : acceptée
**Portée** : dernier point de la phase 2. Précise la rétention décidée par
l'[ADR 0003](0003-stockage-et-chiffrement-des-pieces.md), qui ne couvrait que les pièces.

## Contexte

`/agences` promet « un acte prêt à signer […] signé électroniquement, archivé ». C'est le moment où
le produit cesse d'être un outil de consultation pour devenir un outil d'engagement — et où une
erreur ne se rattrape pas : un cautionnement nul ne protège personne, et l'agence ne le découvre
qu'au moment où elle en a besoin.

### L'histoire du texte est un piège

La loi ELAN (n° 2018-1021 du 23 novembre 2018, article 134) a **supprimé** la mention manuscrite que
l'article 22-1 de la loi du 6 juillet 1989 imposait à la caution, ainsi que la nullité qui la
sanctionnait. C'est cette réforme qu'on cite partout pour justifier la dématérialisation, et c'est
là que s'arrête la plupart des lectures.

Mais l'[ordonnance n° 2021-1192 du 15 septembre 2021](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000044044558)
portant réforme du droit des sûretés, **en vigueur au 1er janvier 2022**, a rétabli une mention à
l'[article 2297 du Code civil](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044071230) :

> _À peine de nullité de son engagement, la caution personne physique **appose elle-même la mention**
> qu'elle s'engage en qualité de caution à payer au créancier ce que lui doit le débiteur en cas de
> défaillance de celui-ci, dans la limite d'un montant en principal et accessoires exprimé en toutes
> lettres et en chiffres._

Elle n'est plus **manuscrite** — c'est ce qui rend la dématérialisation complète possible. Mais elle
doit être **apposée par la caution elle-même**, et le manquement est sanctionné par la nullité.

## Décision

### La mention ne sera jamais pré-remplie

C'est la conséquence produit la plus importante de cet ADR, et elle est contre-intuitive dans un
produit qui vend l'automatisation.

L'acte est pré-rempli — les parties, le bail, le montant, la durée — **sauf la mention**, que le
garant saisit lui-même, montant en toutes lettres et en chiffres. Un champ pré-rempli, ou même
pré-suggéré d'un peu trop près, ferait tomber l'engagement. On livrerait alors un produit qui
fonctionne parfaitement et ne protège rien, ce que l'agence découvrirait le jour de l'impayé.

> **À vérifier côté contenu** : `lib/content/agences.ts` annonce un acte « pré-rempli à partir du
> bail et des pièces ». C'est exact et ça le reste, mais la formule frôle la ligne. Le parcours devra
> montrer explicitement que la mention, elle, se saisit à la main — c'est un argument de sérieux
> autant qu'une obligation.

**La formule, elle, est libre.** La réforme de 2021 a supprimé la phrase type qu'il fallait recopier
mot pour mot, et dont la moindre erreur de vocabulaire annulait l'acte. C'est un assouplissement
réel : on ne peut plus se tromper de formulation. Mais le **contenu** reste contraint, à peine de
nullité — la mention doit exprimer :

1. la volonté de s'engager **en qualité de caution** ;
2. l'obligation de **payer le créancier en cas de défaillance du débiteur** ;
3. le **montant maximal garanti, en chiffres et en toutes lettres** (en cas de divergence, les
   lettres l'emportent) ;
4. si l'engagement est **solidaire**, la renonciation aux bénéfices de discussion et de division.

Ces deux faits ensemble dessinent exactement ce que doit faire le parcours : **guider sans
pré-remplir**. On affiche les quatre éléments exigés, le garant compose et saisit, et le serveur
vérifie ce qu'il a écrit — cohérence entre le montant en chiffres et celui en lettres, présence de
la clause de solidarité quand le bail l'exige. On contrôle le résultat, on ne le fournit pas.

### Signature avancée, chez un prestataire qui sait faire du qualifié

Le règlement eIDAS distingue trois niveaux : simple, avancée, qualifiée. Les trois sont recevables
en justice, mais seule la **qualifiée** bénéficie de la présomption de fiabilité de l'article 1367
du Code civil, précisée par le
[décret n° 2017-1416](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000035676246). Avec une
signature avancée, c'est à celui qui s'en prévaut — l'agence — de prouver la fiabilité du procédé.

**On retient l'avancée**, pour une raison de parcours et non de coût : le qualifié exige que le
prestataire de confiance vérifie lui-même l'identité, par vidéo ou identité numérique. Les pièces
d'identité que nous détenons déjà **ne s'y substituent pas** — eIDAS impose que le prestataire fasse
sa propre vérification. On ajouterait donc une session de quelques minutes sur l'acteur le plus
fragile du parcours : le garant, qui ne paie rien, qui rend service, et qui peut abandonner à tout
instant. Un dossier abandonné à 90 % ne protège personne non plus.

Ce qui rend l'avancée défendable ici, c'est le faisceau de preuves, et il est inhabituellement épais :
pièce d'identité au dossier, trace du dépôt, horodatages, et le journal de consultation nominatif de
l'[ADR 0004](0004-filigranage-et-trace-de-consultation.md). Un prestataire de signature générique
n'a presque rien de tout cela.

**Mais le niveau doit rester un paramètre, pas une hypothèse d'architecture.** On choisit donc un
prestataire qui propose les deux sur la même API, pour que passer au qualifié soit un réglage et non
une migration.

**Signal de sortie vers le qualifié** — la première contestation sérieuse, ou le premier réseau qui
en fait une condition. Les deux sont probables ; ni l'un ni l'autre n'est certain aujourd'hui.

### Critères du prestataire

Dans cet ordre :

1. **Prestataire de service de confiance qualifié (QTSP) établi dans l'UE**, hébergement UE —
   cohérent avec la région UE choisie à l'[ADR 0001](0001-supabase-postgres-et-storage.md), et
   évite d'ajouter une question de transfert hors UE à un dossier qui n'en a pas besoin.
2. **Les deux niveaux sur la même API**, pour que le signal de sortie ci-dessus coûte un paramètre.
3. **Signature par lien, sans compte pour le signataire** — sinon on trahit la promesse au dernier
   écran du parcours, après l'avoir tenue partout ailleurs.
4. **Facturation à la signature**, qui tombe exactement sur la ligne « signer et archiver : à
   l'acte » de `tarifAgence`.
5. **Archivage à valeur probante** inclus.

Sur ces critères, et après relevé des tarifs publics : **Universign** (Cryptolog International,
groupe Signaturit).

|                     | Universign / Signaturit                                 | Youtrust (ex-Yousign)               |
| ------------------- | ------------------------------------------------------- | ----------------------------------- |
| Engagement          | Aucun, résiliable à tout moment                         | **Annuel**, à partir de 1 248 €     |
| Abonnement          | 23 €/mois (10 transactions) à 38 €/mois (illimité)      | 104 à 129 €/mois, facturé à l'année |
| Signature avancée   | **2,50 €** par signature                                | Module additionnel, prix non public |
| Signature qualifiée | **à partir de 10 €** par signature                      | Module additionnel, prix non public |
| QTSP, hébergement   | Trust List UE depuis 2016, centres de données en France | QTSP Trust List UE                  |

Ce qui décide, ce n'est pas le prix unitaire — c'est **l'engagement**. Youtrust demande
1 248 € à l'année avant la première signature, sur un pilote dont on ignore le volume : à cent
actes, ça fait plus de 12 € l'acte en frais fixes. Universign se résilie à tout moment et facture à
la transaction. Quand on ne connaît pas son volume, on n'achète pas un volume.

Le second critère décisif : les deux niveaux sont **publiés, sur la même API**. Le « le niveau reste
un paramètre » de cet ADR devient chiffrable à l'avance — passer à l'avancé au qualifié, c'est
2,50 € qui deviennent 10 €. Chez Youtrust, il faut appeler un commercial pour le savoir.

Restent trois points à confirmer avant de signer, qui ne se lisent pas sur une page de tarifs : ce
qu'une « transaction » recouvre exactement quand l'agence contresigne (une ou deux ?), si
l'archivage à valeur probante est inclus ou en supplément, et le mode de vérification d'identité
retenu pour l'avancé. Cet ADR fixe le choix et son raisonnement, pas le contrat.
Sur ces critères, **Yousign** (français, QTSP, API-first) est le candidat principal, et
**Docaposte** l'alternative — plus lourde, mais le nom de La Poste vaut un argument commercial
auprès d'une agence prudente. Le choix final demande une conversation commerciale et une lecture des
conditions : cet ADR fixe les critères, pas le contrat.

### L'acte signé échappe à la règle des trois mois

L'[ADR 0003](0003-stockage-et-chiffrement-des-pieces.md) a posé trois mois de rétention puis
destruction de la clé. **Appliquée telle quelle à l'acte signé, cette règle détruirait la preuve de
l'engagement trois mois après sa signature** — soit exactement l'inverse du service rendu.

Les deux objets n'ont pas la même nature. Les pièces justificatives servent à **décider** : elles
deviennent inutiles une fois la décision prise, et la CNIL demande de les détruire à ce moment-là.
L'acte est un **contrat** : il doit survivre au bail et à la prescription qui le suit.

D'où deux classes de rétention, et un raffinement de l'ADR 0003 : **la clé de chiffrement est
attachée à la classe de rétention, pas au dossier.** Détruire la clé des pièces au terme des trois
mois ne touche pas l'acte, qui porte la sienne.

L'exemplaire faisant foi est celui qu'archive le prestataire, avec sa valeur probante. Notre copie
est une commodité — pour que l'agence retrouve l'acte sans quitter Cloison — et non le dépositaire
de la preuve.

## Ce que cette décision ne tranche pas

**La rédaction de l'acte lui-même.** Le formalisme du cautionnement est sanctionné par la nullité,
et l'application de l'article 2297 aux baux d'habitation, après le va-et-vient ELAN puis ordonnance
de 2021, mérite d'être confirmée par un avocat. **Cet ADR décide d'un procédé de signature, pas d'un
modèle d'acte** — et le second doit être relu par un conseil avant la première signature réelle. Je
signale l'obligation, je ne la qualifie pas.

**Qui signe.** Le garant signe, évidemment. Que le locataire ou l'agence contresignent est une
question de parcours, à trancher avec le premier vrai dossier.

**Le contrat avec le prestataire**, et le sous-traitant supplémentaire qu'il ajoute au registre RGPD
— même remarque que pour Supabase, tâche 17.

## Conséquences

- Un troisième sous-traitant, après Supabase et Resend. À inscrire au registre, DPA à signer.
- Un coût variable par acte, adossé au revenu plutôt qu'aux charges fixes : c'est le bon sens de la
  dépendance, mais il pose un plancher au prix de l'acte. Aux tarifs relevés, un acte revient à
  **environ 3 à 5 €** tout compris en avancé — abonnement amorti et signature — soit une part
  supportable d'un acte facturé quelques dizaines d'euros.
- **Le choix de l'avancé n'est pas qu'une question de parcours, c'est aussi l'économie unitaire.** À
  partir de 10 € la signature qualifiée contre 2,50 € l'avancée, le qualifié consommerait le tiers
  ou la moitié du prix de l'acte. Le signal de sortie vers le qualifié ne se déclenchera donc pas
  seul : il s'accompagnera nécessairement d'un nouveau prix de l'acte, et il faut le savoir avant
  de le tirer.
  dépendance, mais il pose un plancher au prix de l'acte. À connaître avant d'annoncer un tarif.
- Le schéma des dossiers porte désormais une **classe de rétention** par objet, pas une échéance
  unique par dossier. À écrire en phase 3, en même temps que la table `dossiers`.
- Le parcours du garant gagne un écran incompressible — la saisie de la mention — qu'il ne faut pas
  chercher à optimiser. C'est le seul endroit du produit où la friction est la fonctionnalité.

## Alternatives écartées

**Le qualifié dès maintenant** — juridiquement le plus solide, et la présomption de fiabilité est un
vrai argument commercial. Écarté sur le parcours du garant **et** sur l'économie unitaire, pas sur le
principe : le choix de prestataire est fait pour que ce soit réversible en un paramètre.

**Attendre un qualifié gratuit via France Identité** — l'identité numérique de l'État abaisse le
coût de la vérification, pas celui du service de confiance : un prestataire qualifié doit financer
son infrastructure et sa conformité ANSSI, et ne peut pas délivrer à 0 €. Ce n'est pas une option
qui arrive, c'est un prix qui baissera peut-être.

**Une signature maison** — horodatage, journal, case à cocher. Ce serait une signature simple
habillée en solennité, sur un acte sanctionné par la nullité. Le pire des trois niveaux, avec
l'apparence du meilleur.

**DocuSign ou un prestataire hors UE** — outillage excellent, mais ajoute une question de transfert
hors UE à un produit dont l'argument est le cloisonnement, et se défend mal devant une agence qui
demande où vont les données de ses clients.

**Renvoyer l'acte au papier** — l'agence imprime, fait signer, scanne. C'est exactement ce que
`/agences` promet de supprimer (« Plus d'impression, plus de rescan »), et ça casse le seul moment
du parcours qui justifie de payer.
