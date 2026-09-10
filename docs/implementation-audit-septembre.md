# Implementation de l'audit du 8 septembre 2026

## Diagnostic administratif des paiements prepare le 9 septembre

Le lot ajoute une extraction privee par session Checkout : reservation, registre,
evenements, observations, references PaymentIntent anterieures et tarifs. La
transaction est en lecture seule avec instantane stable. Les roles applicatifs
ne gagnent aucun acces ; aucune migration n'est ajoutee. Le fichier prive ne peut
pas ecraser une destination existante et son empreinte permet de verifier une copie.

17 tests cibles passent. Quinze contre-preuves ont ete observees rouges, dont la
lecture seule, les limites, les projections confidentielles, le refus d'ecrasement,
TLS et une livraison concurrente sous PostgreSQL natif. La compilation et ses deux
traces documentaires passent. Le controle global final passe : 928 tests dans
107 suites, types, lint, format, typographie et variables publiques. Ce resultat
local ne remplace pas une CI de livraison.

Ce diagnostic ne constitue pas une resolution : aucun remboursement, acquittement,
nouvel acces HTTP ou appel Stripe n'est effectue. Le suivi durable des decisions,
les corrections ciblees et la facturation agence restent ouverts. La procedure est
dans [le runbook](exploitation/diagnostic-paiement.md).

Le socle distant reste main 7b51df4 avec 0043 appliquee. Les PR87 a PR91 sont encore
ouvertes ; 0044 et 0045 ne sont pas appliquees. GitHub Actions refuse le demarrage
des jobs pour facturation lors du dernier controle. Aucune fusion ne doit etre
deduite des controles locaux.

Lounes autorise les corrections, PR, fusions et livraisons. Universign, le modele
contractuel et les validations non techniques restent de son cote. Une fonction
dependant de ces elements reste fermee tant que ses conditions ne sont pas reunies.

## Ordre de livraison

| Lot | Perimetre                                                                                                      | Etat                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | F01 formulaires lies au dossier affiche ; F07 confirmation des lignes ecrites                                  | PR 64 fusionnee, main 32d7d69 ; 621 tests et build locaux verts                  |
| 2   | F02 expiration des acces agence ; F19 dernier administrateur ; F14 debit documentaire                          | F02 PR67, dernier admin PR72, quotas PR74 livres ; 0033/35/36 appliquees         |
| 3   | F03 unite du plafond ; F04 centimes ; F05 version des conditions ; F06 controle indicatif de mention           | Livre PR68, migration 0034 appliquee                                             |
| 4   | F08 renouvellement et deconnexion des porteurs                                                                 | Livre PR68, reprise et deconnexion verifiees                                     |
| 5   | F09 supervision de cadence ; F10 budgets de maintenance ; F11 et F12 livraison des liens et courriels          | Budgets PR69 et liens durables PR75 livres ; calendrier independant prepare      |
| 6   | F13 limites des documents ; F14 processus et quotas                                                            | Flux PDF PR68 et quotas PR74 livres ; limite memoire native a renforcer          |
| 7   | F15 chaine contractuelle et adaptateur ; F16 sauvegarde et rotation ; F22 rapprochement des paiements          | A implementer, activation fournisseur distincte                                  |
| 8   | F17 pages d'information ; F18 pagination ; F19 gestion des membres ; F20 parcours ; F21 complements et profils | Pagination dossiers PR73 et collaborateurs PR76 livres ; autres parcours ouverts |

Les idees produit du rapport sont des ajouts a concevoir avec les regles d'acces
et les obligations applicables, pas des fonctions declarees livrees par ce tableau.
La signature et les textes juridiques exigeront les elements prepares par Lounes.

## Lot 1

Les huit actions des porteurs refusent un formulaire dont le dossier ne correspond
pas a la capacite courante, avant tout client metier ou traitement documentaire.
Le champ cache ne donne aucun droit : le jeton et les politiques SQL restent requis.
Tous les formulaires des pages locataire et garant transportent ce contexte.

Engagement, mention et loyer exigent une ligne retournee par PostgREST avant
d'annoncer le succes. La lecture prealable de l'engagement refuse aussi une panne.
Les tests reproduisent les refus inter-onglets, le contexte absent et les mises
a jour de zero ligne. Les cas autorises avec une ligne retournee restent couverts.
17 contre-preuves observees rouges ; 20 tests d'actions verts et 14 tests de pages.
Pas de migration SQL dans ce lot. Les ecritures avec retour utilisent les droits
de lecture deja accordes au meme porteur.

Controle complet local : 621 tests dans 70 suites, types, lint, format,
typographie et variables publiques verts. La compilation Next est reussie et
les deux traces documentaires sont executees apres correction du separateur de
chemin Windows ; pixels du filigrane controles, aucune fuite dans le bundle.
Les tests CLI utilisent des URL de fichiers pour les imports ESM. Les tests de
restauration verifient les octets sur Windows ; les modes POSIX sont verifies
sur Unix. La commande de sauvegarde refuse toujours une cle dont les permissions
privees ne sont pas verifiables, donc reste fermee sur Windows. Les jonctions
Windows et les liens Unix sont refuses sans supprimer les cibles existantes.

## Presentation publique

PR 57 fusionnee le 8 septembre, commit a6b306e. La signature est presentee comme
indisponible et les CTA publics conduisent a l'ouverture du dossier. CI de main
34206374189 suivie apres fusion.

## Livraisons suivantes

PR67 fusionnee, main 107896c, CI 34211953665 verte. 0033 appliquee apres
repetition ; empreinte et droits sous authenticated verifies. Supervision de
production 34213007314 verte.

PR69 fusionnee, main cec8cdc. CI finale 34213011586 verte ; 626 tests locaux
avant rebase sur 0033, build et traces documentaires executes. Verification
de main suivie separement.

PR68 regroupe les lots garant prepares initialement dans PR68, PR70 et PR71 :
montants et centimes, version des conditions, invalidation de la mention,
deconnexion et reprise apres transmission, flux PDF par morceaux. 77 tests
cibles de l ensemble passent. Les rendus du parcours de reprise a 375 px et
sur ordinateur, puis la redirection de deconnexion, sont verifies dans Next
local. La reception des courriels et un gros PDF sur Vercel restent des essais
fournisseur distincts.

0034 est appliquee et immuable apres la fusion de PR68, main 6ce4e03. Sa repetition Supabase sous le
role porteur_lien passe et annule les fixtures. La CI a detecte un droit anon
implicite sur le declencheur ; il est retire explicitement et le contre-test
est vert. Les documents de deploiement et empreintes incluent la correction.

PR68 : 677 tests dans 78 suites, controle local et build verts, deux traces
documentaires executees. CI finale 34214921067 verte. Droits et empreinte
verifies apres application de 0034. PR70 et PR71 sont remplacees par cette
livraison commune.

Le lot administrateur ajoute 0035 et ses essais. Aucune agence de production
sans administrateur au controle prealable. La repetition des droits sous
authenticated passe et annule les fixtures. CI preparatoire 34215269359 verte,
y compris sabotage et concurrence sur deux connexions en Read Committed et
Repeatable Read. Application et CI finale confirmees dans la section suivante.

## Quotas avant analyse documentaire

0036 appliquee et immuable, PR74 fusionnee, main 1f16589 : 20 tentatives par dossier, 60 par IP, 300 pour
l'application par fenetre de quinze minutes. Le refus precede la lecture des
octets, y compris pour un fichier invalide. Droits et empreinte repetes sur
Supabase avec rollback, seule la fonction de comptage change. Les processus
isoles et la concurrence documentaire restent a traiter. Voir
[le runbook](exploitation/debit-documentaire.md).

## Verification en production et navigation

0035 est appliquee et immuable. PR72 fusionnee, main 982f7cc, CI finale
34216310131 verte. Repetition transactionnelle, droits authenticated et empreinte
verifies apres application. Ne pas rejouer le lot. Le controle suivant de main
est 34217258887.

Le PDF volumineux est maintenant verifie sur Vercel : source synthetique de
771038 octets, sortie filigranee de 11684637 octets, deux pages lisibles par
pdf-lib, HTTP 200 pour le compte fictif de la bonne agence et 401 sans session.
Une trace nominative est presente, Cache-Control no-store et aucune longueur
imposee. La session AAL2 est une fixture signee, pas un nouvel essai du parcours
MFA. Comptes, agence, dossier et objets Storage fictifs supprimes apres l'essai.

La liste agence charge au maximum 51 lignes et en affiche 50. La ligne suivante
sert uniquement a proposer la page suivante. Ordre stable par date puis id,
recherche litterale par reference et e-mail, filtres conserves dans les liens.
Les pages invalides retournent a la premiere plage ; les recherches sont limitees
a 120 caracteres. Les droits RLS existants restent applicables. Huit tests de
regression observes rouges avant correction puis verts. Le journal des acces
et une pagination par curseur pour les tres gros volumes restent distincts.

## Liens durables et administration livres

PR73 est fusionnee en d31cde0, CI main 34220585204 verte. Les listes ont ete
controlees sur ordinateur et a 375 px, notamment le retour a la premiere page
quand le filtre change.

PR75 est fusionnee en e8b8569, CI main 34222790620 verte. 0037 appliquee et
immuable : l'intention de livraison du lien est creee atomiquement avec son
jeton, puis chiffree et mise en file avec le meme identifiant. Le renouvellement
annule la file de l'ancien jeton. Un courriel deja accepte par le fournisseur
peut encore arriver ; son ancien lien est invalide. L'identifiant fournisseur
et le rapprochement des livraisons restent distincts.

PR76 est fusionnee en c0abe41. 0038 appliquee et immuable, repetition finale et
controle des droits et empreintes apres application passes. CI finale 34225730590
verte, dont restauration PostgreSQL native. Le controle compare les permissions
effectives, y compris celles des sequences, en normalisant leurs deux ecritures
equivalentes ; le test refuse toujours un privilege ajoute. CI de main a suivre : 34227009520. La page equipe a ete controlee sur ordinateur et a 375 px avec
fixtures locales restaurees avant livraison.

0039 prepare une confirmation persistante de maintenance et un calendrier
Supabase independant. L'absence de creneaux GitHub a ete observee ; les reprises
manuelles ne suffisent pas a la corriger. L'installation et son execution
planifiee doivent etre verifiees avant de declarer ce calendrier operationnel.
Voir [le runbook](exploitation/cron-independant.md), notamment les privileges
geres par Supabase et le controle de non-exposition du schema net dans l'API.

## Etat actualise apres PR78

PR76 : CI main 34227009520 verte. PR77 fusionnee en e3b135e, CI main
34228341663 verte ; 0039 appliquee et immuable. Le calendrier Supabase est actif
chaque quinze minutes. Les executions planifiees de 15 h et 15 h 15 ont obtenu
HTTP 200 et avance la confirmation en base. La supervision 34229427337 passe.
Les privileges internes geres par Supabase restent documentes dans le runbook ;
le schema net est refuse par PostgREST et cette frontiere est supervisee.

PR78 fusionnee en a6adc2a, CI main 34231177094 verte ; 0040 appliquee et immuable.
757 tests locaux et build passes. Les courriels conservent leur reference
fournisseur et acceptent des evenements signes, idempotents et ordonnes sans
conserver leur contenu. Le webhook Resend externe et son secret restent a
configurer ; aucune reception reelle n'est declaree verifiee.

0041 prepare la pagination des historiques agence et garant, par 50 acces, sans
perdre les dates identiques ni decaler les pages lors d'un nouvel acces. Les
adresses devenues personnelles sont masquees dans les deux fonctions de lecture.
Repetition transactionnelle Supabase et cinq contre-preuves passees ; application
et fusion restent a effectuer. Voir [le runbook](exploitation/pagination-journal.md).

Restent notamment les parcours navigateur automatises, les profils documentaires,
la rotation des cles, le rapprochement des paiements et la chaine contractuelle.
Les processus documentaires sont deja isoles et limites en temps et tas JavaScript ;
le plafond de memoire native et la concurrence globale restent des limites ouvertes.

PR79 fusionnee en 24f4311 ; 0041 appliquee et immuable, droits reels et empreinte
verifies apres application. CI finale 34233061347 verte, 766 tests locaux et build
avec les deux traces documentaires passes. La pagination des historiques est
livree ; le controle de main 34234392806 est suivi separement.

PR80 fusionnee en 5c00861, CI main 34236563951 verte. Lecture des webhooks de
paiement bornee en taille et en duree ; 761 tests locaux avant integration des
historiques, 53 tests cibles apres integration et build passes.
PR81 fusionnee en a99536d, CI finale 34237414135 verte ; 774 tests locaux et build
passes. Le webhook demande un rejeu lorsqu'une confirmation SQL est ambigue.
Le controle de main apres cette derniere fusion reste suivi separement.

## Registre financier et etat au 8 septembre, 17 h 20

Les CI main de PR79 (34234392806), PR81 (34238766497) et PR82 (34240180884)
sont vertes. PR82 est fusionnee en 6537946 : formats de rotation livres, 776 tests
locaux et build passes, sans modification des cles de production.

Le lot 0042 prepare un registre minimal, des versions tarifaires immuables, le
suivi des remboursements et litiges et un rapprochement fournisseur en lecture
seule. Le formulaire affiche le tarif reserve et le compare avant Checkout.
102 tests cibles passent ; les repetitions Supabase sont annulees et verifient
les roles reels et empreintes. Les retraits volontaires des gardes ont produit
5, puis 6, puis 9 echecs attendus. Les controles complets, la concurrence native,
l'application SQL et la fusion restent a effectuer. 0042 n'est pas encore appliquee.
Voir [le registre des paiements](exploitation/registre-paiements.md).

Le rattrapage automatique vise les references historiques et celles des suivis
recus ; il ne parcourt pas encore toutes les reservations Checkout sans aucun
webhook. Cette extension, la resolution tracee des anomalies et la facturation
agence restent ouvertes. Les integrations externes ne sont pas declarees activees.

## Livraison du registre et rescellement administratif

PR83 fusionnee en 75d9214 apres CI finale 34244402408 verte : 834 tests, build,
restauration et concurrence PostgreSQL native. 0042 appliquee et immuable,
empreinte et droits reels verifies apres application. Le controle de main et
la supervision apres deploiement sont suivis separement.

Le lot suivant prepare l'outil administratif de rescellement des cles de dossier
et des courriels. Inventaire sans ecriture, comparaison de l'ancienne valeur,
reprise par lots et refus de recreer un contenu supprime. Quatorze tests cibles
passent apres trois, puis quatre echecs volontaires des gardes. Aucun droit
applicatif supplementaire ni changement de cle en production. La CI complete
et la verification native du meme moteur restent a confirmer avant fusion.

## Profils documentaires et livraisons precedentes

PR83 : CI main 34245723671 et supervision de production 34246076442 vertes.
PR84 fusionnee en dea73b5 : dependances actualisees, audit npm sans vulnerabilite
connue, CI finale 34246043990 et main 34247344745 vertes.
PR85 fusionnee en 15ef79b : outil administratif de rescellement livre, 844 tests
locaux avant integration des dependances, 14 tests cibles ensuite, build et
restauration native passes. CI finale 34247728248 verte ; main suivi separement.
Aucune cle de production n'a ete changee ni sauvegarde externe prouvee.

0043 prepare les profils salarie, retraite et independant, les nombres explicites
de justificatifs groupes, leur correction et le recalcul des dossiers ouverts.
Repetitions transactionnelles Supabase et controles des roles reels passes,
avec empreintes exactes. Les gardes SQL et les confirmations des actions ont
chacune produit quatre echecs lors de leur retrait volontaire, puis sont revenues
au vert. Les tests complets, la CI, l'application SQL et la fusion restent a faire.
Le rendu SSR des composants est controle sur donnees fictives : cette preuve ne
remplace pas un parcours interactif authentifie. L'examen humain et les demandes
de complements restent ouverts dans F21. Voir le runbook des profils.

## Rattrapage des sessions reservees (0044 preparee)

Le lot ajoute les references Stripe reservees depuis quinze minutes sans aucun
webhook au rapprochement en lecture seule, avec dossier non expire, deduplication,
limite de deux references et espacement des reprises. Une incoherence avec la
reference ou le tarif reserve, ou avec le dossier de la reservation, conserve
une anomalie sans crediter le dossier.

26 tests du registre et de cette extension passent. Le retrait volontaire des
gardes a produit sept echecs, puis les dix tests de l'extension sont revenus au
vert. Empreintes locale et Supabase calculees : seules les fonctions changent.
Les repetitions transactionnelles incluent provisoirement 0043, encore non
appliquee, puis 0044 ; les roles reels passent et tout est annule. La CI complete,
l'application des deux migrations dans l'ordre et la fusion restent necessaires.

## Reprise depuis GitHub au 9 septembre 2026

La reference distante est main 7b51df4, PR86 fusionnee. La migration 0043 est
appliquee : son empreinte exacte est retrouvee au debut de la repetition de 0044.
Ne pas rejouer 0043. La PR87 est reprise sur ce main, avec resolution des trois
conflits de documentation et de references de schema. Les empreintes apres 0044
sont conservees seulement apres verification transactionnelle de leur valeur.

La repetition de 0044 seule, puis celle avec les fixtures des roles reels, passe
avec ROLLBACK. Aucun appel Stripe, paiement, courriel ni changement SQL persistant.
0044 reste non appliquee. Les controles locaux de la revision reconciliee sont
suivis dans la PR87 avant toute livraison.

Les jobs GitHub de maintenance et supervision echouent avant toute etape depuis
le blocage de facturation du compte : l'annotation signale un paiement echoue ou
un plafond de depenses a augmenter. Aucune modification de facturation effectuee.
Ce n'est pas une execution applicative en erreur et cela ne valide pas la CI.
La fusion et l'application du lot attendent une CI verte sur la revision finale.

Le calendrier Supabase independant reste actif toutes les quinze minutes.
Les executions de 06 h 45, 07 h, 07 h 15 et 07 h 30 UTC du 9 septembre sont
reussies. La confirmation applicative en base date de 07 h 30 min 04 s UTC,
controlee a 07 h 40 UTC, donc recente. L'execution SQL du calendrier seule n'aurait
pas suffi a cette preuve. La reception humaine des alertes reste distincte.

## Demandes de complements, lot 0045

Parcours agence et garant prepare : demande avec motif borne, reouverture explicite,
depot d'un remplacement, examen agence et nouvelle correction. Les pieces ecartees
ne comptent plus et le retrait d'un remplacement invalide son examen. Le locataire
ne lit aucune demande. Les notifications generiques sont durables et distinctes
par destinataire ; leur reception reelle n'est pas prouvee par les doubles.

Depend de 0044, encore non appliquee. Repetition Supabase annulee et controles de
roles reels passes, huit sabotages SQL/actions observes rouges puis restaures.
Les composants sont inspectes en 390 et 1280 pixels sur fixtures ; parcours
navigateur authentifie complet distinct. Ce lot ne termine pas l'approbation de
chaque piece initiale ni la chaine contractuelle. Voir le runbook
[Complements documentaires](exploitation/complements-documentaires.md).

Validation locale finale du lot : npm run check passe avec 911 tests dans 105
suites. Build, integration PostgreSQL/PostgREST et restauration native passent.
Les lots exacts 0044 puis 0045 et les droits ont ete repetes puis annules sur
Supabase. Application SQL, CI finale et fusion restent distinctes et en attente.

## Parcours navigateur automatises des porteurs

Le harnais local inclut maintenant Chromium, les formulaires de profil et de
nombre de documents, une falsification effectivement envoyee puis refusee,
et la proposition d'un remplacement. Les resultats sont controles en PostgreSQL
sur mobile et ordinateur. Le locataire reste exclu du depot du garant.
Le job CI natif installe le navigateur et active ces essais ; sa livraison
reste soumise a une CI verte. Auth fournisseur, upload Storage et parcours
agence complets restent distincts. Voir [les preuves et limites](exploitation/parcours-navigateur-locaux.md).

## Livraison du 10 septembre

PR87 fusionnee en 6a16848 apres reussite de la CI finale 34325610070 sur
047484f. 0044 appliquee apres repetition annulee ; roles reels et empreinte
exacte verifies apres application. 0044 devient immuable. La CI de main
34455907869 est suivie avant la livraison suivante.

GitHub Actions execute de nouveau ses jobs depuis le passage du depot en public.
Le lot 0045 est conserve apres integration de main ; ses empreintes restent
celles de ce lot, a controler par une nouvelle repetition transactionnelle.

## Verification du devis lors de la reprise Stripe, 9 septembre 2026

Lot independant prepare depuis main 7b51df4, sans migration. La reprise d'une
session ouverte refuse maintenant les incoherences de dossier et de tarif avant
de rendre son URL. Huit contre-preuves observees rouges avant correction, puis
38 tests cibles passes. La reprise historique reste possible avec son montant
reserve. Aucun paiement reel ni livraison en production n'est affirme par ces tests.
Voir [les controles et limites](exploitation/reprise-session-ouverte.md).

## Refus borne des webhooks, 9 septembre 2026

Le lecteur commun Stripe et Resend refuse les corps excessifs sans attendre
une annulation de flux potentiellement bloquee ou rejetee. Trois regressions
observees rouges avant correction. Aucune migration ni appel fournisseur.
Voir [les preuves et limites](exploitation/refus-webhooks.md). Livraison en PR
independante, soumise aux controles complets et a une CI verte.

## Integration de livraison publique, 10 septembre

Les CI finales relancees des PR87 a PR92 passent depuis le changement de
visibilite. PR87 est fusionnee et 0044 appliquee. La PR94 livre ensemble les
lots des PR88 a PR93 sur main a4a0cdf : reprise Stripe, refus des webhooks,
complements, Chromium, diagnostic prive et protections du depot public.
La CI finale 34456788330 passe avec 940 tests dans 107 suites, les parcours
Chromium, PostgreSQL natif et la restauration. Apres repetition sous ROLLBACK,
0045 est appliquee puis ses roles et son empreinte exacte verifies. Ne plus
modifier ni rejouer 0044 ou 0045. Le deploiement Production 6368114098 reussit ;
la supervision 34458099693 confirme le schema et la maintenance recente.

La verification locale Windows de cette combinaison compte 937 tests verts
et trois echecs de tests POSIX (dont la creation de lien interdite par Windows).
Les tests de fichier prive sont reserves aux plateformes avec uid POSIX ; un
test commun verifie le refus sans uid, sans creation ni ecrasement de fichier.
Le code de production ne change pas et ne pretend pas verifier les ACL NTFS.

L'audit public ne detecte aucun secret dans les 233 commits examines, les PR et
commentaires, et les trois derniers journaux reussis selectionnes. Les mesures
et limites sont detaillees dans [le controle public](exploitation/depot-public.md).

Le refus sans uid a ete vu rouge en court-circuitant temporairement sa garde
(EXIT=1), puis vert apres restauration : 13 tests passes, trois cas POSIX
non applicables sur Windows. La CI Linux conserve ces trois cas.

## Controle de secrets et PR externes, 10 septembre 2026

Le controle obligatoire de secrets analyse l'historique complet du candidat,
sans recuperer les PR externes independantes. L'audit de toutes les anciennes
PR reste disponible par lancement manuel explicite du workflow Secrets.
Cela evite qu'un tiers bloque toutes les livraisons par une fausse cle dans
une PR sans lien avec le code a livrer. Un secret retire du candidat reste detecte.

Contre-preuve Gitleaks dans un depot fictif hors projet, puis detruit : candidat
sans secret accepte (0), audit de toutes les branches refusant la fausse cle
externe (1), candidat ayant ajoute puis retire une fausse cle refuse (1).
Aucun canari ni secret reel ajoute au depot Cloison. Aucun changement applicatif
ou SQL. Le controle complet local du commit precedent passe sur Windows avec
938 tests et trois cas POSIX non applicables ; la CI Linux passe ses 941 tests.
