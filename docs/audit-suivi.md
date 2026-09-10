# Suite de l'audit du 5 septembre 2026

La [PR 43](https://github.com/Lounes-M/Cloison/pull/43) a ete fusionnee le 6 septembre
a 01:08, dans le commit a9ad93a41725ced9db90162ec75a1a49203bd17d. Ce document remplace
l'affirmation selon laquelle les phases 0 a 7 seraient terminees. Aucun resultat de test local ne vaut preuve de
configuration de production.

## Etat courant au 9 septembre 2026, apres PR86

Reference GitHub verifiee : main 7b51df4. Les livraisons PR57 a PR86 sont
consignees dans [le suivi de septembre](implementation-audit-septembre.md),
qui couvre les limites documentaires, liens durables, equipe, historiques,
calendrier independant, courriels, registre financier et outils de rotation.
Les anciens nombres de tests et versions des sections suivantes sont historiques.

0043 est appliquee : l'empreinte de production correspond exactement a main.
Le role anonyme ne lit pas cette empreinte ; le serveur la lit, et le schema net
reste exclu de PostgREST (PGRST106). 0044 reste uniquement repetee avec annulation.
La PR87 est reprise sur main apres resolution de ses conflits ; la preuve locale
et l'etat de sa nouvelle CI sont conserves dans cette PR.

GitHub Actions refuse de demarrer les jobs en raison de la facturation du compte
(paiement echoue ou plafond de depenses selon l'annotation). Aucune etape
applicative n'est executee dans ces jobs rouges. Le calendrier Supabase reste
actif ; la confirmation applicative de maintenance du 9 septembre a 07:30 UTC
etait recente lors du controle de 07:40 UTC. La reception humaine des alertes
et le retablissement de GitHub Actions restent necessaires.

Les PR87 a PR91 restent ouvertes lors de la reprise suivante, main toujours
7b51df4. Les complements documentaires (0045) et les parcours navigateur sont
prepares, pas livres. Un diagnostic administratif des paiements est ajoute sans
migration : il produit un instantane prive mais ne resout aucune anomalie.
Les preuves actualisees figurent dans le suivi d'implementation ; les validations
fournisseur, le suivi durable des decisions et la facturation restent ouverts.

## Historique au 7 septembre 2026, apres PR56

Cette section est le point d'entree. Les sections suivantes conservent la chronologie :
les constats du 5 septembre ne decrivent pas necessairement la production actuelle.
Chaque nouvelle passe ajoute ici son resultat, ses preuves et ce qui reste ouvert.

| Sujet                           | Etat et preuve                                                                                                                                         | Limite restante                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Livraison du socle              | PR 43 a 56 fusionnees ; main d298674 ; CI main 34043063293 verte                                                                                       | Une CI verte seule ne prouve pas les parcours reels                                                       |
| Migrations                      | Migrations jusqu'a 0032 appliquees ; controle du schema deploye et droits verifies                                                                     | Ne jamais rejouer ou modifier une migration deja appliquee                                                |
| Depot et retrait                | Formulaires HTTP natifs sur Vercel, PDF fictif restitue a l'identique, journal et retrait verifies                                                     | Auth/MFA navigateur verifies avec entree technique ; lien magique et dernier rendu mobile restent ouverts |
| Reprise apres interruption      | [Maintenance non vide reussie](https://github.com/Lounes-M/Cloison/actions/runs/34004605271) : un objet supprime, file acquittee, upload tardif refuse | La copie CDN chiffree peut subsister apres suppression a l'origine                                        |
| Sauvegarde                      | Export chiffre, restauration PGlite et restauration PostgreSQL native fictives verifies                                                                | Restauration de production et copie de secours de la cle maitresse non demontrees                         |
| Courriels                       | Files chiffrees, reprise et transport testes ; configuration expediteur verifiee                                                                       | Livraison reelle au destinataire non prouvee                                                              |
| Signature et facturation agence | Socle technique uniquement ; Universign et modele contractuel pris en charge par Lounes                                                                | Aucun acte signe ni facturation agence valides de bout en bout                                            |

601 tests dans 69 suites sur main d298674. Vercel
dpl_JAowrv6fkvLVZUiMYDRUDVjDbjP8 Ready ; filigrane de production visible,
acces AAL2 et refus inter-agences verifies sur document fictif. Les cinq entrees
de purge signalees par Supervision ont ete acquittees par la maintenance
34043271491 sans erreur ni courriel envoye ; Supervision 34043331193 verte.
Les executions planifiees ulterieures examinees jusqu'au 7 septembre sont vertes.
Le cron GitHub ne garantit pas la cadence demandee : plus de deux heures entre
executions ont ete observees. Reception humaine et couverture d'incident ouvertes.

## Passe 57 : presentation publique du pilote

La verification navigateur de l'accueil a reproduit un bouton Creer mon dossier
inerte dans la section parcours et un dernier CTA qui renvoyait a cette meme
section. Les deux dirigent maintenant vers /demarrer. La contre-epreuve navigateur
sur l'ancienne production echoue sur le CTA absent ; le parcours corrige est
verifie sans envoi de formulaire.

Les textes publics distinguent le coffre du parcours de signature encore non
ouvert. Le ratio est presente comme calcule sur le revenu declare, sans pretendre
authentifier les justificatifs. Les tarifs viennent des montants centraux :
9 euros locataire, 29 euros par acte signe et archive lorsque disponible, garant
gratuit. L'ouverture affiche l'etat du pilote avant le formulaire. Les objectifs
commerciaux sont identifies comme tels et le delai de reception du courriel
n'est plus garanti a une minute. Pas de nouvelle promesse juridique.

Verification visuelle et de navigation sur accueil, agences et demarrer, en
390 et 1440 pixels. Le hero agence debordait a 320 pixels : grille et repli des blocs corriges, contre-epreuve rouge puis verte en 320/390/1440, bascule au clavier verifiee. Le parcours Auth mobile et les apercus LinkedIn/WhatsApp
restent distincts de ces pages publiques. Livraison et CI suivies dans la PR 57.

## Passe 56 : controle de derive du schema

Le lot ajoute douze empreintes de catalogue reservees au serveur, une reference
locale controlee en CI et une reference Supabase explicite, puis une route de
verification sans cache. Le workflow Supervision appelle ce controle meme si
l'etape des compteurs echoue. Le controle ne publie que conforme ou non conforme.

Les comparaisons natives retrouvent les memes tables, contraintes, indexes,
politiques et declencheurs applicatifs. Les differences de plateforme et de
sources historiques sont examinees dans le runbook. Les adhesions de roles sont
lues integralement : une premiere version trop restreinte manquait un octroi de
service_role a authenticated ; le test a ete vu rouge puis corrige. Aucun octroi
similaire n'est present en production lors du controle.

41 tests cibles couvrent les mutations du catalogue, les refus des quatre roles,
les references strictes, les erreurs HTTP, la non-divulgation et l'independance
des etapes. Treize sabotages sont detectes. Cinq cas supplementaires ont ete vus rouges puis corriges : droits par colonne publics/Storage, tables partitionnees, vues materialisees et droits futurs. Le controle complet local passe 594 tests dans 68 suites avant integration de la PR 55 ; build et integration native reussis. La repetition 0032 a ete annulee, puis la migration appliquee apres CI verte sur a064695. Les droits SQL et RPC reels sont verifies ; voir la PR 56 pour les preuves de livraison. Voir [derive du schema](exploitation/derive-schema.md).

## Passe 55 : police du filigrane en production

Le parcours HTTP complet a ete exerce apres PR 54 sur Vercel : depot par le
formulaire garant, original restitue a l'identique, acces agence AAL2 reel,
refus autre agence, suspension, journal puis retrait. Les fixtures sont nettoyees.
L'inspection du PDF de production a toutefois montre une absence de filigrane,
malgre la rasterisation : le rendu dependait d'une police systeme implicite.
Les tests et le rendu local n'avaient pas ferme cette difference d'environnement.

Le moteur enregistre desormais LiberationSans-Regular.ttf, deja transporte avec
pdf.js, sous une famille explicite. Une police illisible fait echouer l'ouverture
au lieu de restituer silencieusement un document non marque. Les tests verifient
l'enregistrement et l'usage de cette famille ainsi que l'encre produite ; le
chargement automatique des polices systeme est desactive dans le sous-processus.
Sur macOS, cela ne prouve pas l'absence de tout fallback natif du systeme.

Le controle des fichiers traces au build rend une page blanche marquee et exige
des pixels visibles. Le simple compte de pages avait laisse passer le defaut.
Controle global local : 560 tests dans 66 suites, types, lint, format, typographie et build reussis. La PR 55 est fusionnee apres CI verte sur 87d559c. Le parcours HTTP de production est rejoue sur main bff673b : depot, original exact, AAL2, refus anonyme/AAL1/autre agence, suspension, journal et retrait reussis. Le PNG du PDF produit par Vercel est inspecte : adresse fictive complete, date et Cloison visibles. Toutes les fixtures sont nettoyees. Voir la PR pour la CI main.
Aucun document reel n'a ete utilise ; aucune cle de production n'a ete extraite.

## Passe 54 : filigrane lisible et ouverture agence reelle

Une session Supabase Auth AAL2 reelle a consulte un PDF fictif chiffre dans le
Storage du projet, via le build Next local. Refus anonyme (401), AAL1 (307 vers
MFA), agence etrangere (404 identique a une piece absente), acces autorise (200
sans cache), journal nominatif unique et suspension (401) sont verifies. Les
fixtures de demonstration sont supprimees, objets Storage et comptes inclus.
Cette preuve HTTP ne remplace pas le parcours navigateur complet de production.
La cle maitresse est une cle fictive propre a l'essai, jamais la cle Vercel.

L'inspection visuelle a trouve des repetitions superposees avec une adresse
longue. Le pas fixe du filigrane est remplace par un espacement mesure et des
lignes qui conservent toute l'identite, avec une copie centree. Deux tests de
geometrie etaient rouges avant correction ; les essais existants de rasterisation
continuent de verifier l'absence de texte selectionnable et de contenu actif.
Trois sabotages supplementaires (espacement, mots coupes, identite tronquee) sont detectes. Le rendu corrige est inspecte en PNG ; le parcours HTTP est rejoue avec succes, puis les fixtures sont nettoyees. Les preuves de livraison seront consignees dans la PR.

## Passe 53 : supervision et photographie du pilote

Le lot ajoute une lecture SQL agregee reservee au serveur, une route protegee
sans cache et un workflow GitHub horaire. Les volumes d'ouvertures et les files
en retard rendent le workflow rouge ; seuls des compteurs sont publies. Aucun
compte n'est bloque et aucune donnee personnelle supplementaire n'est collectee.
Les dates futures et demonstrations sont exclues. Le pilote expose une photographie
sur 28 jours des dossiers encore presents, pas un taux de conversion historique.

Les tests couvrent droits SQL, seuils, dates, files, format strict, pannes HTTP,
redirections, secret, cache, journaux et codes de sortie du programme reel.
Dix-neuf sabotages ont ete detectes. La repetition transactionnelle 0031 sur Supabase a reussi ; apres rollback, fonction et index sont absents. 0031 est maintenant appliquee, apres CI de PR verte sur 724391d. Droits SQL et RPC verifies, serveur autorise et anonyme refuse 401/42501. Vercel dpl_GmJ2CC7Nr9kNVq4FpacDkcMfhzxg est Ready ; le [workflow Supervision](https://github.com/Lounes-M/Cloison/actions/runs/34039463089) est vert avec compteurs a zero. Voir la PR 53 pour la CI main.
Controle global local : 556 tests dans 64 suites, types, lint, format, typographie et build reussis.
Les taches 40 et 48 restent ouvertes pour la reception humaine des alertes et
les observations du pilote reel. Voir les runbooks de supervision et du pilote.

## Passe 52 : Auth reel et deconnexion agence

Deux comptes et agences fictifs isoles ont ete utilises avec le vrai service
Supabase Auth et la base du projet, via le build Next local dans un navigateur.
L entree de session est technique, provisionnee sans courriel : cet essai ne
valide pas la reception ni le clic du lien magique de production.

Premier passage : code TOTP incorrect refuse, code correct accepte, AAL2 observe,
creation d agence et role administrateur verifies. Le renouvellement est provoque
en vieillissant uniquement la date locale du cookie, sans modifier le JWT signe ;
un vrai appel refresh_token est observe et la session persiste au rechargement.
La suspension bloque l espace, la reactivation le rend, puis l exclusion empeche
le rattachement automatique. Aucun dossier ni piece crees pendant ces essais.

Un defaut est reproduit : apres MFA, l espace ne proposait aucune deconnexion.
Le formulaire est maintenant dans le layout agence. Sa visibilite depend seulement
du cookie local pour rester utilisable pendant une panne ; cela ne donne aucun
droit, les pages verifient toujours Auth et la base.
La deconnexion vise cette session et efface ses cookies, fragments et verificateurs
PKCE meme si le fournisseur echoue. Les cookies des autres projets et la capacite
locataire/garant sont preserves. Une panne distante ne prouve pas la revocation
immediate d un jeton deja copie ; cette limite reste explicite.

Deuxieme passage : MFA et espace accessibles avec le correctif, deconnexion reelle
confirmee par Supabase, puis /espace refuse. Une panne 503 du logout est ensuite
simulee dans le proxy local : les cookies sont tout de meme effaces et /espace
reste refuse. Les comptes, facteurs et agences fictifs sont supprimes et les
processus arretes ; les journaux du fournisseur ont leur retention propre.

Controle global local : 518 tests dans 61 suites, types, lint, format, typographie
et build reussis. Six tests cibles couvrent l affichage du formulaire, les pannes et le perimetre des
cookies. Cinq echecs initiaux sont corriges ; trois sabotages rendent rouges
l absence d effacement, l effacement d un autre projet et le bouton anonyme.
Le Mac s est verrouille apres les essais : le dernier controle visuel mobile
reste a reprendre. Voir [le runbook Auth](exploitation/auth-agence.md) et la
[PR 52](https://github.com/Lounes-M/Cloison/pull/52) pour la livraison.

## Passe 51 : confidentialite des journaux applicatifs

Le controle du code a trouve des erreurs fournisseur brutes dans les journaux de
connexion, capacites, depot, ouverture, actions agence/garant/locataire et paiement.
Certains appels ajoutaient un chemin de piece ou un identifiant de dossier.
Les appels explicites a la console n acceptent desormais que des libelles constants,
avec des categories finies pour la maintenance et le webhook.

Deux nouveaux fichiers de tests couvrent 27 scenarios : analyse syntaxique du
code applicatif et pannes simulees aux frontieres Auth, SQL, Storage et moteur
documentaire. Le controle source et 14 cas de panne etaient rouges avant correction.
Quatre contre-epreuves supplementaires refusent un mauvais aiguillage Auth,
un appel fournisseur sans code, une exception brute et un analyseur desactive.
Les exceptions sont formatees comme dans une console ; JSON.stringify seul aurait
masque le message des objets Error dans le test.

Le retour de connexion traite maintenant aussi les exceptions de creation du
client ou d echange de code avec la meme redirection d echec, sans erreur brute.
La page d erreur globale ne promet plus qu aucune donnee n a ete perdue ou exposee :
une panne de chargement ne permet pas de le savoir.

Ce lot ne prouve pas une fuite historique en production et ne supprime pas les
anciens journaux. Il ne controle pas les traces propres a Next, aux dependances
ou a l hebergeur. Le journal SQL nominatif des acces reste distinct et conserve.
Voir [la procedure de diagnostic](exploitation/journaux-applicatifs.md).
Controle global local : 512 tests dans 59 suites, types, lint, format et typographie
reussis. Les validations de build, CI et livraison sont consignees dans la
[PR 51](https://github.com/Lounes-M/Cloison/pull/51).

## Passe 50 : paiement navigateur et webhook

Le parcours de paiement est maintenant exerce dans un vrai navigateur, avec le
build Next, PostgreSQL/PostgREST locaux et le service Stripe en mode test. Le
listener Stripe transmet les evenements au webhook local avec son secret ; aucun
webhook de production n'a ete reconfigure. Les trois dossiers sont fictifs.

- Carte de test nominale : paiement de 900 centimes, evenement recu en 200,
  marquage SQL et retour navigateur confirmes, echeance prolongee a trois mois.
- Fonds insuffisants : refus visible ; dossier non paye, retour annule verifie.
- 3D Secure : echec simule laisse le dossier non paye, puis authentification de
  test reussie et retour au dossier paye.

Les deux paiements fictifs restent dans l'historique Stripe de test. La session
refusee a ete expiree, la base locale detruite et les processus arretes. Aucun
encaissement reel, courriel ou justificatif personnel dans ces essais.
Le compte utilise affiche LM Services et DRIFTERR.APP : identite commerciale a
clarifier avant tout changement susceptible d'affecter un autre projet.
La correspondance avec le compte de production et sa configuration restent a
verifier ; le succes local ne constitue pas une validation du mode live.

Le webhook ne journalise plus les details SQL ni les references de paiement ;
les exceptions de lecture ou de transport rendent un 503 JSON constant. Cinq
echecs initiaux et un sabotage de signature sont reproduits, puis corriges.
Le harnais CI traverse Next/PostgREST : six refus sans RPC de marquage, paiement
signe et replay sans changement de date, reference ou echeance. Un mauvais secret
sur le cas positif fait echouer le harnais. Les signatures CI sont fictives ;
elles se distinguent du listener fournisseur utilise dans le navigateur.

Le bouton annonce seulement le reglement : l'envoi au garant demande ensuite de
saisir son adresse et de confirmer.

Controle navigateur public : 16 blocs Reveal sur / et 17 sur /agences, tous
reveles sur ordinateur et mobile (390 x 844), sans debordement horizontal constate
sur les etapes controlees. En mouvement reduit, les 33 blocs sont immediatement
visibles sans animation. Sans JavaScript, le fallback rend les 33 blocs visibles
apres son delai de 4,4 secondes ; la bascule Parcours reste utilisable au clavier,
avec un seul panneau affiche. Les reglages temporaires du navigateur sont retires.
Le fallback s'applique aussi lorsque JavaScript fonctionne : les blocs peuvent
etre deja visibles lors d'un scroll tardif ; cette limite du mouvement est conservee.

Controle global local : 485 tests dans 57 suites, types, lint, format et build.
Les statuts de CI et de livraison sont suivis dans la
[PR 50](https://github.com/Lounes-M/Cloison/pull/50).

## Passe 49 : reprise du paiement locataire

Douze tests cibles passent apres cinq contre-epreuves rouges : inscription SQL
sans ligne modifiee, date invalide, date future d'un jour, borne exacte de 23 heures
et copie de l'adresse client dans une erreur SDK journalisee. La confirmation
SQL exige desormais la ligne modifiee ; une date incoherente ferme la reprise,
avec tolerance de cinq minutes entre horloges. Le journal d'erreur est constant.
Les dates impossibles constituent un durcissement defensif, pas une exploitation
par un utilisateur reproduite.

Les pertes de reponse Stripe et SQL avant/apres commit, ainsi que deux rotations
concurrentes, conservaient deja une seule session dans le modele deterministe.
Ce modele teste le code applicatif, pas une course PostgreSQL distante.
Un essai distinct sur l'API Stripe en mode test retrouve la meme session avec la
meme cle et refuse des parametres modifies. La session fictive a ete expiree ;
aucun paiement ni courriel effectue. Cet essai n'est pas un paiement de bout en
bout et ne ferme pas la tache 42. Les six scenarios initialement verts ont aussi
ete vus rouges par sabotage dans une copie temporaire.
Controle global local : 477 tests dans 56 suites, types, lint, format, typographie,
variables publiques et build reussis. Le statut de livraison et les CI sont suivis
dans la [PR 49](https://github.com/Lounes-M/Cloison/pull/49). Le contrat d'idempotence de Stripe est verifie dans sa
[documentation officielle](https://docs.stripe.com/api/idempotent_requests?lang=node).

## Passe 48 : sauvegarde, restauration et journaux de paiement

La restauration native, jusqu'ici executee manuellement, devient un harnais
versionne pour la CI. Un contrat d'export impose version, format, date, tailles,
empreintes et inventaire exact des objets avant toute nouvelle archive et avant
extraction d'une archive recente. Les anciennes archives restent identifiees comme
une verification d'integrite seule. Les 27 tests cibles passent apres contre-epreuves
sur contrat et archive falsifies. L'exercice natif retrouve 22 tables, 101 contraintes,
38 politiques et 88 fonctions ; trois sabotages sont detectes. La verification
globale passe : 466 tests dans 55 suites, types, lint, format et build.
Le mode Docker et la livraison sont suivis dans la
[PR 48](https://github.com/Lounes-M/Cloison/pull/48). Aucun export de production ni changement de cle maitresse dans cette passe.

La feuille de route est requalifiee tache par tache : les apercus externes, Auth
reel, reception de courriels, acte, paiement complet, restauration de production
et alertes operationnelles ne sont plus presentes comme termines sans preuve.

Une erreur de signature Stripe invalide contient le corps HTTP brut dans sa
propriete payload. La journalisation de cette erreur a reproduit une copie du
corps dans les logs avec le vrai SDK et des donnees fictives, sans appel reseau.
Un journal constant et un test de non-divulgation corrigent cette fuite, avec
contre-epreuve rouge puis verte. Aucun double
paiement ni contournement de signature n'a ete reproduit dans cette revue.

## Passe 47 : maintenance et renouvellement MFA

Defaut reproduit : une exception de notification ou de courriel empechait la purge
des donnees expirees. Six tests ont echoue sur l'ancienne route. La correction
execute la purge en premier et isole les trois phases ; chaque panne garde un
bilan 503, sans interrompre les autres phases ni exposer une erreur de service.
Les compteurs invalides sont refuses. Huit tests de phases et un test HTTP couvrent la maintenance ; verification globale et livraison terminees en PR 47.
Controle complet local : 441 tests dans 53 suites, types, lint, format et build
passes. Le harnais HTTP MFA passe aussi sur ce build : page OTP rendue, un seul
renouvellement SDK et cookie frais retourne, apres un echec sur l'ancien build.
Le statut de livraison, la CI du commit final et les controles apres deploiement
sont consignes dans la [PR 47](https://github.com/Lounes-M/Cloison/pull/47).

La revue Auth/MFA a reproduit un renouvellement de session perdu sur la page
/connexion/securite : le vrai SDK renouvelle deux fois, mais aucun Set-Cookie ne
parvient au navigateur. La page MFA doit participer au renouvellement du middleware.
Le middleware et le test du vrai SDK corrigent ce point : cookie rendu au navigateur et a la requete interne, un seul renouvellement. Le harnais scripts/verifier-session-mfa-http.mjs rejoue cette verification apres build dans la CI ; aucun contournement MFA observe.
Le navigateur reel atteint la page de connexion depuis /espace, sans session agence
active ; le parcours authentifie complet reste ouvert. Aucun lien de connexion
n'a ete envoye dans cette passe.

Constat au debut de la PR 47 : l'emballage chiffre acceptait un dump vide et une configuration non JSON : ce sont
des octets integres, pas une preuve de sauvegarde exploitable. L'essai fictif l'a
confirme, sans donnees distantes. Prochain lot sauvegarde : contrat d'export valide,
puis pg_dump/pg_restore PostgreSQL avec roles et donnees Auth fictives. L'outil
actuel reste explicitement un emballage et une extraction, sans execution SQL.

## Corrections livrees par la PR 43

- Claims JSON PostgREST, validite du jeton et expiration du dossier dans les politiques.
- Suspension d'agence, exclusion persistante d'un collaborateur, MFA a deux facteurs.
- Changement de garant interdit une fois invite : recommencer dans un dossier distinct
  conserve l'isolation des personnes. Designation et rotation de lien atomiques.
- Loyer fige apres la declaration du garant ; ecritures interdites apres transmission.
- Transition vers signe interdite aux comptes agence, reservee a une integration verifiee.
- Purge des justificatifs y compris dossier signe, file de suppression physique via Storage.
- Recuperation d'un lien locataire sur adresse et reference, rattachement a une agence verifiee.
- Originaux du garant telechargeables avec journalisation avant dechiffrement.
- Tentative Checkout persistante, controle du montant/devise et verrou du paiement en base.
- Depot Storage reserve a un jeton serveur court, validation structurelle et limites de pixels.
- Collecte de demandes agence reservee au serveur.
- Courriels chiffres en file, baux de traitement, reprise idempotente et reconciliation.
  Les liens locataire/garant et les notifications agence utilisent aussi cette file.
- Notifications creees dans la transaction du changement de statut.
- Journal des acces visible au garant, isole par dossier ; reprise d'enrolement MFA.
- Loyer fige et garant non remplacable expliques dans les formulaires.
- Texte sombre sur les fonds orange pour ameliorer le contraste.

## Constat historique du 5 septembre, avant rattrapage

Le 5 septembre, le projet Supabase Cloison contient zero dossier et zero piece.
La migration 0019 n'est pas appliquee : anon possede encore l'emission de jetons,
et le role serveur ne la possede pas. pg_cron n'est pas installe.
Vercel et Stripe CLI sont connectes. Les secrets Production sensibles de Vercel
ne peuvent pas etre exportes : ils n'ont pas ete remplaces pour contourner cette protection.

## Points restant ouverts avant le premier dossier reel

- Parcours navigateur authentifies de bout en bout combinant formulaires, Auth agence et Storage.
  Les preuves HTTP porteurs et Storage isolees sont decrites plus bas.
- Modele contractuel valide, generation d'acte, chaine Universign et facturation agence.
- Integration Universign et tests complets du parcours contractuel dependants du modele valide.
- Sauvegarde recuperable avec cle de secours, exercice de restauration et revue externe.

La PR 43 a passe les verifications et la CI avant fusion. Les elements dependants d'un compte,
d'un texte contractuel ou d'une configuration doivent etre identifies sans etre marques termines.

## Preuves de verification

La premiere serie de corrections (commit cea327a) a passe 360 tests, le build,
la CI GitHub et la previsualisation Vercel. La seconde serie passe egalement le controle complet : 365 tests dans 36 suites.
Le script `scripts/test-postgrest.mjs` verifie par HTTP les claims JSON, la
revocation, le refus des signatures falsifiees et l'absence d'acces anonyme.
Il a ete execute avec PostgreSQL 17 et PostgREST 16.2 locaux ; une tache CI le rejoue.
Le harnais Storage reste minimal : ce test ne prouve pas le fonctionnement du
service Storage Supabase complet.

Le rattrapage 0010 a 0013, 0017 et 0019 a 0028 est applique en production.
CRON_SECRET est configure dans Vercel Production et GitHub Actions. La route
est deployee. L'expediteur Resend est configure ; la livraison effective,
l'exercice de restauration et la validation des ecrans authentifies restent a verifier.
La connexion Universign est confirmee le 6 septembre dans le workspace Cloison. Aucun acte n'a ete signe,
aucune facture agence emise. Les corrections du socle sont fusionnees dans main.

La lecture de l’API Supabase ne liste aucune sauvegarde disponible et indique
PITR desactive. Aucun exercice de restauration ni controle de la copie de secours
de CLE_MAITRESSE n’a ete realise.

## Acces Universign verifie le 6 septembre

Le compte utilise l'essai gratuit du 5 au 19 septembre 2026, avec zero transaction
sur dix et aucun modele enregistre. Le menu Developpeur n'est pas present.
Le tableau des offres du compte reserve la boite a outils developpeur a Enterprise ;
la signature avancee n'est pas incluse dans l'essai affiche.

L'acces au portail ne prouve donc pas l'activation de l'API necessaire a CLOISON.
Faire confirmer par Universign l'acces API et un environnement de preproduction,
le niveau de signature avancee, l'archivage et les conditions commerciales.
Aucun abonnement n'a ete modifie et aucune transaction n'a ete envoyee.
Le modele d'acte valide reste a fournir, meme apres activation de l'API.

Reference technique : [creation des cles API](https://apps.universign.com/docs/fr/developer_tools/API_keys/).

## Traitement documentaire, 6 septembre

Le decodage et la rasterisation passent dans un processus Node distinct, arrete
apres 15 secondes, avec deux traitements simultanes au maximum par instance.
Les flux sont plafonnes, les dimensions restent controlees avant allocation,
et les images doivent etre reellement decodables. Aucun secret applicatif n'est
transmis dans l'environnement du processus et aucun original temporaire n'est ecrit.
Cela ne constitue pas une sandbox systeme : le processus conserve les droits du
compte serveur et la limite du tas JavaScript ne borne pas la memoire native.
Un service documentaire isole avec quotas systeme reste une amelioration a evaluer.

Les tests ciblent notamment le blocage CPU, la sortie excessive, la concurrence,
l'heritage des secrets et une fausse image PNG. Quatre protections ont ete desactivees
temporairement : les quatre tests correspondants ont echoue, avant restauration.
Les dependances du processus sont incluses explicitement dans les traces Next.js.
Reference : [tracage des fichiers Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

Lounes prend en charge l'activation Universign et le modele contractuel ; les autres
corrections et verifications continuent. Ces deux dependances ne sont pas marquees livrees.

## Courriels et controle complet

Le 6 septembre, Resend affiche `cloison.immo` verifie, region Irlande.
`EMAIL_EXPEDITEUR` a ete ajoute a Vercel Production avec
`Cloison <notifications@cloison.immo>`. Il prendra effet au prochain deploiement.
Aucun courriel de test n'a ete envoye ; la livraison effective reste a prouver.
Le controle local complet passe 370 tests dans 37 suites, avec typage, lint,
format et controles de variables publiques. Le build execute ensuite le moteur
hors du checkout a partir des traces des routes agence et garant.

## Retard de schema precise par repetition

La repetition du 6 septembre a montre que l'estimation initiale etait incomplete :
0010 a 0013 et 0017 manquent aussi, alors que des migrations plus recentes sont presentes.
Le plan de quinze migrations a passe une repetition transactionnelle sur Supabase,
terminee par annulation et verification distincte. Aucun changement de schema n'est conserve.
Le script `scripts/preparer-rattrapage-production.mjs` fournit le SQL unique et ses
preconditions ; voir `docs/exploitation/rattrapage-production.md` pour l'application.

## Droits implicites Supabase

La lecture de `pg_default_acl` en production montre des grants EXECUTE explicites
pour anon et authenticated sur les nouvelles fonctions. Le harnais ne reproduisait
que les droits de table. Une fois ce defaut reproduit, le nouveau test a echoue :
la recuperation de lien et plusieurs fonctions internes restaient executables.
La migration 0028 retire ces droits sur les seules fonctions applicatives et
retablit une liste explicite d'appelants. Les extensions et fonctions gerees par
Supabase ne sont pas modifiees. Le harnais conserve le defaut permissif pour
prevenir une regression lors des prochaines migrations.

La suite complete passe maintenant 372 tests dans 38 suites avec les droits de
fonctions Supabase reproduits. Le bucket `pieces` est prive et TOTP est active
pour l'enrolement et la verification. Avant correction, la lecture des privileges
confirme notamment `marquer_dossier_paye` executable par anon et authenticated.
La verification HTTP couvre desormais ces refus en plus des claims et revocations.

## Livraison et controles de production, 6 septembre

Le lot de quinze migrations a ete applique en une transaction apres CI verte.
Empreinte SHA256 du lot :
`70e59d59303143feae13c952170c6f45badd621f5348f2b2c5fba28a81570890`.
Une connexion distincte a confirme les tables nouvelles et les permissions ;
les fonctions de paiement, recuperation et calcul sont refusees a l'anonyme
par l'API publique avec HTTP 401 et SQL 42501. Zero dossier et zero piece apres operation.
Un inventaire du schema avant/apres a ete conserve localement, sans donnees de personnes.

Vercel a deploye le commit fusionne avec succes. Le domaine canonique est
`www.cloison.immo` : le domaine sans www renvoie une redirection 308.
La route de maintenance refuse un appel sans secret en HTTP 401 sur ce domaine canonique.

Le premier workflow de maintenance retournait un faux succes sur la redirection 308.
Le suivi utilise maintenant le domaine canonique, refuse toute redirection, exige HTTP 200
et verifie les compteurs d'erreurs. Son test local reproduit redirection, HTML, JSON
incomplet, erreurs metier et authentification incorrecte.

Ce controle a ensuite detecte HTTP 503 : le secret de signature configure sur Vercel
ne permettait pas d'authentifier le role serveur aupres de Supabase. Le secret courant
a ete verifie contre la signature du jeton public du projet, puis configure dans
Vercel comme secret, sans impression ni fichier contenant sa valeur. Le redeploiement
du meme commit main a retabli la connexion. Le workflow corrige
[33999095368](https://github.com/Lounes-M/Cloison/actions/runs/33999095368)
passe contre la production : HTTP 200 et zero erreur dans les trois files, alors vides.
Cela prouve la connexion et l'execution, pas encore un envoi de courriel ni la
suppression d'un objet Storage reel.

La suite locale de suivi passe 374 tests dans 40 suites ; le build et l'execution
des dependances documentaires tracees passent egalement.

Les erreurs JSON du moteur documentaire sont remplacees par un message controle :
un test a reproduit la presence d'un contenu fictif dans l'erreur brute avant correction.
L'audit npm des dependances de production ne signale aucune vulnerabilite connue.

## Nouvelle passe parallele hors Universign, 6 septembre

- Les pages authentifiees distinguent panne de base et donnees absentes. Les erreurs
  sont generiques et passent par l'ecran permettant de reessayer. Les scenarios
  de panne ont ete vus rouges puis verts.
- La reduction photo conserve l'original sans Canvas, ferme ses ressources en cas
  d'erreur et aplatit la transparence sur blanc avant JPEG.
- Les notifications de categories differentes ne partagent plus leur identifiant
  quand l'adresse est identique. Elles sont mises en file ; le travailleur livre
  dix messages maximum par passage, avec trois secondes de transport par message.
  Une reponse Resend sans identifiant ne vaut plus livraison. La reconciliation
  decouverte pendant le passage apparait dans son bilan.
- Un export local chiffre et une extraction controlee sont disponibles. L'exercice
  restaure une vraie base PGlite et un objet fictif apres suppression de la source,
  puis dechiffre avec une cle maitresse fictive independante. Ce n'est pas encore
  une sauvegarde et restauration Supabase de production.
- Le service Storage reel a ete exerce avec des fixtures chiffrees, des refus
  d'acces et une suppression API. La copie CDN peut subsister apres suppression
  a l'origine ; voir `docs/exploitation/essais-storage.md`.

La migration 0029 ajoute la reprise durable des retraits et protege contre une
inscription reussie dont la reponse HTTP a ete perdue : le nettoyage ne peut plus
detruire son objet. Les chemins abandonnes ne peuvent pas etre reinscrits apres
acquittement de la file. Le role serveur de maintenance devient le seul role
applicatif autorise a supprimer physiquement un objet Storage.

Limite identifiee en PR 45 : un arret brutal apres upload et avant programmation du nettoyage
peut encore laisser un objet orphelin jusqu'a l'expiration du dossier. Une reservation
avant upload exige aussi de serialiser l'ecriture Storage et sa finalisation ; un
simple delai ne prouve pas l'absence de course. Ce protocole n'est pas revendique ici.

Un harnais traverse desormais Next et PostgREST sur un vrai PostgreSQL local :
liens signes, cookies HttpOnly, separation des donnees et revocation sont eprouves
avec des fixtures non vides. Une politique RLS ouverte volontairement a fait echouer
l'essai avant restauration. La CI le rejoue. Il ne constitue pas un test navigateur
avec hydratation, soumission de formulaire ou authentification agence Supabase.

Deux connexions PostgreSQL reelles eprouvent la concurrence inscription/abandon.
Le blocage est constate via les verrous Postgres, puis chaque ordre de commit est
verifie. Retirer le verrou de programmation a reproduit une mise en file incorrecte.
La CI rejoue ces scenarios. Le mode demonstration utilise aussi le client de depot
serveur introduit en 0024 ; il ne tente plus un upload avec le role porteur interdit.

La migration 0029 doit etre appliquee avant le deploiement de cette passe. Elle est
repetee en transaction annulee sur le projet cible ; aucune migration precedente
n'est modifiee. Les preuves de livraison sont ajoutees a la PR apres CI et application.

Verification locale finale de cette passe : 414 tests dans 49 suites, controle
complet et build reussis. Le nouveau build a repasse les six preuves de parcours
HTTP, les refus PostgREST et les deux scenarios de concurrence PostgreSQL.

## Reservations avant depot, passe 0030

La PR 45 est fusionnee (e86a38e), sa CI main 34002900424 est verte, et la
migration 0029 est appliquee. La maintenance de production 34003084484 passe.
Un formulaire HTTP natif React a depose un PDF fictif sur Vercel, restitue son
original identique et journalise, puis retire sa piece et programme son nettoyage.
La fixture et ses objets ont ete nettoyes. Cela eprouve le chiffrement Vercel et
Storage reels, sans constituer un test navigateur avec hydratation ou MFA agence.
Le harnais reproductible est `scripts/essai-coffre-http.mjs` ; son appelant doit
fournir une fixture demonstration `.invalid` et garantir son nettoyage en finally.

La migration 0030 traite la fenetre de crash du depot : reservation durable avant
upload, delai de quinze minutes non renouvelable, consommation atomique avec la
piece, reprise des reservations expirees par maintenance. Les operations prennent
les verrous dans le meme ordre, dossier puis reservation ; les echeances sont
relues apres attente. Le quota compte pieces et reservations, vingt au maximum.
L'inscription des metadonnees exige desormais le role serveur depot_piece et une
reservation : le navigateur ne peut pas fabriquer une piece sans validation serveur.
Les chemins nettoyes restent interdits apres acquittement de leur file.

Les tests PostgreSQL concurrents couvrent expiration pendant attente, finalisation
et reprise dans les deux ordres. Les sabotages retirant les verrous ou remplacant
l'horloge fraiche ont ete vus rouges. Ces garanties concernent le protocole SQL ;
les caches CDN et les ecritures physiques internes du fournisseur restent distincts.
La migration 0030 exige repetition annulee, CI verte puis application explicite
avant deploiement. Aucun fichier de migration deja applique n'est modifie.

Validation locale de 0030 : 430 tests dans 51 suites, types, lint, format et
controles publics passes. Les huit scenarios concurrents incluent la finalisation
apres expiration du dossier ou du jeton ; leur garde retiree produit un echec.

## Preuve supplementaire de restauration native, 6 septembre

Deux executions sur deux clusters PostgreSQL 17.10 independants ont reussi avec
les vrais clients pg_dump, pg_dumpall et pg_restore 17.6 officiels. Apres export
custom chiffre, suppression de l'export clair et arret de la source, la cible
neuve retrouve 22 tables, 101 contraintes et 38 politiques identiques. Roles,
adhesions, proprietaires, ACL et activation RLS sont compares. Les refus locataire,
jeton invalide et RPC anonyme, ainsi qu'une contrainte invalide, restent effectifs.
Une DEK scellee puis l'objet fictif sont dechiffres avec une KEK fictive conservee
hors archive ; une autre KEK est refusee. Derniere execution : 2,159 secondes,
hors acquisition et compilation des outils ; ce n'est pas un RTO de production.

Les roles sont exportes sans mots de passe. Les deux clusters utilisent le meme
bootstrap postgres ; seul son CREATE ROLE deja present et les directives psql
sont retires de l'export de roles genere par l'exercice. Une cible avec un autre
bootstrap avait echoue sur GRANTED BY postgres : cette dependance reste explicite.

Limites : schema Auth minimal du harnais, objet chiffre local, aucune copie Storage
distante, aucun rendu agence, aucun export Supabase reel, aucune cle Vercel ni
preuve de cle de secours. Ce script d'exercice local n'est pas encore integre a
la CI. Les clusters et donnees fictives ont ete supprimes. La prochaine etape
est de rendre ce protocole reproductible et de valider le contrat d'export ;
le prerequis de restauration de production reste ouvert.
