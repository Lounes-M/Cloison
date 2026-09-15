# Regles operationnelles des demandes individuelles

Version 1. Cette procedure fixe les choix de fonctionnement de Cloison pour
l'acces, la portabilite et l'effacement. Elle ne modifie pas les durees des coffres
en base et ne constitue pas une certification juridique. Universign est hors du
perimetre technique actuel.

## Reception et delais

Accepter une demande par le canal de support publie, sans imposer de compte, de
formulaire particulier, de paiement ni de justification du droit d'acces. Creer
un identifiant aleatoire dans le registre prive. Accuser reception sous deux jours
ouvres : c'est notre objectif de service, pas un delai legal supplementaire.

Traiter sans tarder et fixer l'echeance ordinaire a un mois calendaire apres la
reception, pas a 30 jours. Une prolongation motivee par la complexite ou le nombre
de demandes peut ajouter au plus deux mois ; informer la personne avant la fin
du premier mois. Aucun report automatique en raison d'une verification en cours.
Une absence de donnees ou un refus motive exige aussi une reponse, avec les voies
de recours applicables. Le registre conserve les dates explicites et la preuve
de la decision. Voir [la CNIL sur les demandes d'acces](https://www.cnil.fr/fr/repondre-une-demande-de-droit-dacces).

## Verification proportionnee

L'operateur identifie le demandeur et son role dans chaque dossier concerne.
Pour un compte agence, privilegier une session authentifiee avec MFA et une
confirmation sur le canal deja connu. Pour un locataire ou garant sans compte,
utiliser le canal deja enregistre et examiner les elements de rattachement au
dossier. Une reference publique, un lien historique ou une nouvelle adresse
declares dans la demande ne suffisent pas a ouvrir tous les dossiers.

Ne pas demander systematiquement une carte d'identite. En cas de doute raisonnable,
documenter le doute et demander le complement le moins intrusif qui le resout.
Verifier le mandat et les personnes concernees si un representant intervient.
La perte d'un ancien canal donne lieu a une verification adaptee, pas a un refus
automatique du droit. Ne jamais demander un mot de passe, code MFA ou cle privee.

Ne pas conserver une copie d'identite apres la verification, sauf justification
distincte et documentee. Conserver uniquement la trace minimale de la methode,
de la date, de l'operateur et du resultat ; la preuve detaillee reste dans l'outil
prive. Le registre SQL ne recoit que son empreinte et des identifiants aleatoires.

## Inventaire et protection des tiers

L'inventaire couvre les donnees encore detenues dans les dossiers, pieces,
engagements, comptes, preferences, affectations, journaux, correspondances et chez
les prestataires concernes. Ne pas limiter une demande globale au premier dossier
trouve. Identifier le responsable du traitement et associer l'agence lorsque
son intervention est necessaire. Signaler les sources encore non examinees.

| Situation                                  | Traitement                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Donnees propres au demandeur               | Preparer une copie intelligible apres revue                                                 |
| Donnees exclusivement relatives a un tiers | Exclure du perimetre et expliquer sans reveler le tiers                                     |
| Document mixte ou texte libre              | Relire et expurger les tiers ; fournir les donnees du demandeur sur un support intelligible |
| Appartenance inconnue                      | Suspendre cette ressource pour examen, pas toute la demande par principe                    |
| Cles, jetons, secrets MFA, liens actifs    | Ne jamais restituer les secrets ; traiter leur revocation separement                        |

Un locataire ne recoit pas les revenus ni les justificatifs du garant. Un garant
ne recoit pas les informations d'un autre garant. Un administrateur d'agence
exercant son droit personnel ne recoit pas un export global de son agence.
La revue des tiers s'applique aussi aux PDF, metadonnees, commentaires et traces.
Un fichier original n'est pas declare sur parce que son nom est anonyme.

Joindre les informations utiles sur finalites, sources, destinataires, conservation
et droits. Distinguer la portabilite de l'acces : verifier ses conditions propres
et fournir les donnees eligibles dans un format structure exploitable. Une donnee
non portable peut rester communicable au titre de l'acces. Voir les
[articles 15, 17 et 20](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3).

## Remise et copies de travail

Relire les fichiers finaux, puis figer leurs empreintes et la revision approuvee.
Utiliser l'outil de paquet chiffre existant sur un poste prive qualifie. Verifier
le destinataire juste avant remise, transmettre la cle par un canal distinct et
conserver une preuve minimale de remise. Aucune piece jointe en clair, URL publique
ou secret dans le depot, les tickets publics et les journaux.

Choix de fonctionnement : validite de remise de 72 heures au maximum, raccourcie
si le registre ou la decision expire plus tot. Une nouvelle remise exige une
nouvelle verification de la decision. Effacer les copies de travail apres controle
de la remise, au plus tard a cette echeance. Une copie deja telechargee ne peut
pas etre rappelee par l'expiration du paquet. Le canal de remise et sa purge
automatisee restent a raccorder ; ces controles sont pour l'instant operatoires.

## Effacement et conservation

Previsualiser ressource par ressource, jamais `DELETE dossier` ou `DELETE user`
sur la seule base d'une adresse e-mail. Separer les donnees propres du demandeur
des relations partagees. Pour un compte agence, organiser la succession du dernier
administrateur avant fermeture et revoquer les sessions et capacites concernees.

Sans motif de conservation applicable, proposer l'effacement du perimetre propre.
Une obligation legale ou la defense de droits doit preciser les donnees strictement
necessaires, la justification, les acces restreints et une date de reexamen. Ne
pas creer de conservation indefinie, ni prolonger tous les justificatifs parce
qu'un acte est signe. Actes, paiements et journaux exigent l'examen de leurs
dependances et de leurs obligations avant decision. Le module ne leur attribue
aucune duree legale universelle.

Recontroler la revision et les dependances juste avant execution. Verifier cles,
Storage, files de suppression et prestataires avant de confirmer les operations
realisees. Expliquer les elements conserves et les delais techniques restants.
Une sauvegarde restauree doit rejouer les effacements intervenus apres sa capture.
Ne pas annoncer l'effacement individuel automatique : cet executeur reste a
implementer. La purge ordinaire des coffres continue selon son propre calendrier.

Pour la correspondance du support et les preuves minimales de traitement, choix
interne : purge 90 jours apres cloture, sauf litige documente imposant une
conservation limitee avec reexamen. Effacer avant ce terme les justificatifs
d'identite et copies de donnees devenus inutiles. Cette duree n'est pas presentee
comme une obligation legale ; les dates du registre et les outils externes doivent
etre regles en consequence, sans prolongation silencieuse des suivis existants.

## Previsualisation technique

`lib/droits/regles.ts` valide un inventaire declare et produit des avis par
ressource. Il ne prouve ni l'identite, ni l'exhaustivite, ni la realite des preuves
declarees. Il n'effectue aucun acces SQL, collecte, envoi ou effacement.

L'outil prive `scripts/examiner-demande-droits.mjs` lit un JSON sur l'entree
standard (256 Kio maximum, cinq secondes) et ecrit le rapport sur la sortie
standard. Aucun secret ou nom en argument. Executer avec Node 24 sur un poste de
confiance ; proteger les fichiers et la sortie par les permissions privees du
poste. Ne jamais publier ce rapport, qui contient les identifiants internes.

Le schema strict exige demande, revision, operateur, nature, preuve d'identite,
etat du mandat, confirmation du perimetre, exhaustivite declaree et ressources.
Chaque ressource possede une revision, une categorie, une appartenance, une revue
des tiers, un avis de portabilite et une eventuelle conservation motivee et datee.
Les identifiants dupliques, champs inconnus et preuves mal formees sont refuses.

Le resultat porte toujours `executionAutorisee: false`. Une copie mixte demande
une expurgation a relire ; une conservation echue demande un reexamen ; une
ressource partagee ne devient jamais une proposition d'effacement global.

Une [collecte SQL privee](../exploitation/collecte-personnelle.md) prepare les
donnees structurees des dossiers explicitement approuves dans le registre. Sa
copie de travail reste a relire ; elle declare ses sources manquantes et ne vaut
pas une decision de remise.
