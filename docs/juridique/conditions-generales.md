# Conditions générales : ce que chaque acteur accepte

Tâche 45 de la feuille de route. Trois contrats, parce que les trois acteurs n'ont ni le même
rôle ni les mêmes obligations. Ce document est un **brouillon technique** : il dit ce que le
produit fait réellement et ce que chacun s'engage à faire, tel que le code le tient. Il doit être
transformé en conditions opposables par un conseil avant le premier dossier réel. Ce qui relève
d'une qualification juridique est marqué **à confirmer**.

Les règles qui traversent les trois contrats, et que le dépôt tient par des tests :

- le garant ne paie jamais ;
- le locataire ne voit ni une pièce ni un montant, seulement un statut ;
- toute lecture d'une pièce laisse une trace nominative, que le garant peut consulter ;
- une pièce arrivée à échéance est détruite, pas masquée ; l'acte signé est la seule exception ;
- la mention de cautionnement n'est jamais pré-remplie ni suggérée.

## 1. Le locataire

**Ce qu'il obtient.** Un dossier de garantie, valable trois mois à compter de l'ouverture, dans
lequel son garant dépose ses pièces sans qu'il les voie, et dont il suit l'avancement par un
statut. Un lien d'accès, valable sept jours et une seule fois, renouvelable depuis son dossier.

**Ce qu'il paie.** 9 € TTC, une fois, au moment de désigner son garant, par carte via Stripe.
**Le paiement n'est pas remboursé** si le dossier expire sans décision de l'agence : il achète
trois mois de coffre, pas un résultat. Cette règle est affichée avant le paiement. Un dossier
ouvert par une agence ne lui coûte rien. **À confirmer** : la formulation du droit de rétractation
pour un service pleinement exécuté à sa demande (article L221-28 du Code de la consommation), et la
TVA applicable.

**Ce qu'il s'engage à faire.** Fournir une adresse e-mail à laquelle il a accès ; désigner comme
garant une personne qui a consenti à l'être ; saisir un loyer exact. Ne pas transmettre son lien
à un tiers : le lien est sa clé.

**Ce qu'il accepte sur ses données.** Voir `docs/rgpd/registre-des-traitements.md` : adresse,
nom, loyer, statut, journal des accès ; trois mois ; effacement à l'expiration ou sur demande.

**Ce qu'il ne peut pas attendre.** Une décision de l'agence : Cloison transmet un dossier, il ne
garantit ni son acceptation ni un logement.

## 2. Le garant

**Ce qu'il obtient.** Un lien, valable sept jours et une seule fois, pour déposer ses pièces dans
un coffre où le locataire ne voit rien, et voir qui les a consultées. Ses pièces sont chiffrées
avant d'arriver chez l'hébergeur, servies à l'agence uniquement rasterisées et filigranées au nom
de la personne qui les ouvre, et détruites à l'échéance du dossier.

**Ce qu'il paie.** Rien, dans aucun cas. Aucun parcours, aucun écran, aucune exception : c'est
une règle du produit, tenue par un test.

**Ce qu'il s'engage à faire.** Déposer des pièces authentiques et les siennes ; déclarer un revenu
exact ; écrire lui-même sa mention de cautionnement. Il est informé que l'acte de cautionnement,
une fois signé, est un contrat qui l'engage envers le bailleur, distinct de ces conditions, et qui
survit au bail.

**Ce qu'il accepte sur ses données.** Voir le registre : identité, adresse, revenu déclaré,
pièces justificatives, mention, journal. Trois mois pour les pièces ; l'acte signé selon une durée
propre, **à fixer**. Droit d'accès à ses pièces telles quelles, sans filigrane
(`docs/rgpd/droits-des-personnes.md`).

**Ce qui lui est promis, et tenu par la base.** Le locataire n'a accès ni à ses pièces, ni à son
revenu, ni au ratio. L'agence ne reçoit jamais le document d'origine. Chaque ouverture est
inscrite à un journal que personne ne peut modifier, et qu'il peut lire.

## 3. L'agence

**Ce qu'elle obtient.** Un espace par agence, rattaché à son domaine e-mail, avec des
collaborateurs **illimités et gratuits**. Des dossiers complets : pièces filigranées, ratio de
solvabilité calculé contre son propre seuil, journal des accès, engagement du garant. Un dossier
de démonstration, sans vérification. L'ouverture de dossiers réels après vérification de son SIREN
et de sa carte professionnelle « Gestion immobilière ».

**Ce qu'elle paie.** Rien pour consulter. **29 € HT par acte signé et archivé** (**à confirmer** :
HT ou TTC, et la TVA), facturé à l'acte, sans engagement de durée. Facturer au siège reviendrait à
faire payer un client pour apporter du chiffre : c'est le corollaire de l'ADR 0002, et il n'est
pas négociable.

**Ce qu'elle s'engage à faire.** Ne consulter que les dossiers qui lui sont rattachés, dans le
cadre d'une location réelle ; ne pas diffuser les pièces, dont chaque exemplaire porte le nom de la
personne qui l'a ouvert ; n'ouvrir de dossier réel qu'après vérification ; déclarer des
informations exactes lors de la demande d'activation. Elle est responsable de traitement pour sa
part, et Cloison son sous-traitant, ce qui suppose un accord de traitement (**à rédiger** avec
le conseil).

**Ce qu'elle accepte.** Que Cloison suspende son accès en cas de consultation anormale, de
diffusion de pièces, ou de déclaration inexacte ; que le journal des accès soit tenu en écriture
seule et lisible par le garant ; que la vérification de son agence soit faite par Cloison, à la
main pendant le pilote, sous 48 heures ouvrées.

**Ce qu'elle ne peut pas attendre.** Une garantie sur la solvabilité réelle du garant : le ratio
est calculé sur un revenu déclaré, les pièces sont la preuve qu'elle vérifie elle-même.

## Ce que ces trois contrats ne tranchent pas

- **La loi applicable et la juridiction**, la médiation de la consommation obligatoire pour le
  locataire (article L612-1 du Code de la consommation, **à confirmer**), les mentions légales
  de l'éditeur.
- **Le modèle d'acte de cautionnement**, qui n'est pas un contrat de Cloison mais un contrat entre
  le garant et le bailleur : l'ADR 0005 exige sa relecture par un conseil.
- **Le sort du paiement du locataire si Cloison ferme** pendant les trois mois.
- **La langue** : le produit tutoie le locataire et le garant, et vouvoie l'agence. Les conditions
  peuvent le garder, ou non ; c'est un choix de marque avant d'être un choix juridique.
