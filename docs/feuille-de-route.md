# Feuille de route Cloison

De la landing au premier dossier reel allant jusqu'a un acte signe.
Version de travail du 7 septembre 2026, apres la livraison des PR 43 a 56. Le
[suivi d'audit](audit-suivi.md) conserve les preuves et la chronologie.

La maintenance des dependances de septembre est detaillee dans
[son suivi](exploitation/dependances-septembre.md). Le passage a Vitest 5,
Supabase JS et Resend actualises conserve les controles d'acces existants et
exige une CI complete avant fusion.

Une case cochee signifie que l'element decrit est realise selon la preuve indiquee.
Une implementation seule ne termine pas une tache exigeant une livraison ou un
parcours reel. Aucun total de cases ne mesure la preparation au lancement.
Universign et le modele contractuel sont pris en charge par Lounes ; le reste
avance techniquement sans attendre cette dependance.

La remise a niveau demandee le 8 septembre est suivie dans
[Implementation de l'audit](implementation-audit-septembre.md), avec preuves et
etat de livraison distincts pour chaque lot.

L'expiration des acces agence est corrigee dans la migration 0033, repetee puis
annulee avant livraison. Application et preuves effectives dans
[le suivi du deploiement](exploitation/expiration-acces.md).

Les budgets reseau et la detection de maintenance retardee sont decrits dans
[Budgets de maintenance](exploitation/budgets-maintenance.md).

## Phase 0. Socle et presence publique

- [x] **01** Supprimer le composant Badge inutilise.
- [x] **02** Ajouter les pages d'erreur applicatives et globales.
- [x] **03** Activer Dependabot. Les incompatibilites d'outillage restent suivies dans les dettes.
- [x] **04** Deployer Vercel et le domaine. Le domaine canonique est www.cloison.immo.
- [x] **05** Verifier les animations au scroll dans un navigateur. PR50 : les 16 blocs Reveal de / et les 17 de /agences se revelent sur ordinateur et mobile ; mouvement reduit et fallback sans JavaScript visibles, bascule Parcours au clavier sans JavaScript verifiee.

## Phase 1. Landing et collecte

- [x] **06** Implementer le formulaire agence, ses controles et la persistance. La livraison des courriels se valide en tache 35.
- [x] **07** Livrer la page /agences. Lot 57 : presentation du pilote et tarifs explicites, liens de creation fonctionnels, verification des pages publiques sur mobile/ordinateur ; voir la PR pour la livraison effective.
- [ ] **08** Finaliser et faire valider les mentions legales et la politique de confidentialite. Les textes provisoires ne ferment pas cette tache.
- [x] **09** Integrer la mesure d'audience retenue. La configuration et les textes applicables restent a revoir avec le cadre juridique.
- [ ] **10** Verifier les apercus dans LinkedIn et WhatsApp. L'image generee au build seule ne prouve pas le rendu dans ces services.

## Phase 2. Decisions d'architecture

Les ADR consignent les decisions ; elles ne prouvent pas a elles seules leur execution.

- [x] **11** Documenter le modele d'acces dans les ADR 0002 et 0006.
- [x] **12** Documenter la matrice des droits, puis la couvrir par des refus SQL.
- [x] **13** Decider et implementer le chiffrement par enveloppe. La recuperation des cles reste en tache 38.
- [x] **14** Consigner le choix de signature dans l'ADR 0005. Son integration reste en tache 34.
- [x] **15** Implementer la rasterisation, le filigrane nominatif et le journal.
- [x] **16** Choisir la base et l'hebergement dans l'ADR 0001.
- [ ] **17** Verifier la liste des sous-traitants et leurs contrats avec le conseil competent.

## Phase 3. Socle technique et preuves d'acces

- [x] **18** Separer les routes marketing et les espaces applicatifs.
- [x] **19** Implementer dossiers, pieces, roles et RLS. Migrations appliquees jusqu'a 0031, refus controles par SQL, HTTP et Storage.
- [x] **20** Verifier rattachement, MFA, renouvellement, suspension et exclusion dans un navigateur avec Supabase Auth reel. PR52 : build local, comptes fictifs, entree technique sans courriel ; deconnexion reelle et panne simulee verifiees. La reception du lien magique de production reste en tache 35.
- [x] **21** Implementer les capacites locataire/garant et leur revocation. Les essais refusent un cookie et un lien revoques.
- [x] **22** Chiffrer les pieces avant Storage avec une cle scellee par dossier. La copie de secours de la cle maitresse reste a prouver.
- [ ] **23** Completer le perimetre de validation documentaire. Type reel, decodage, dimensions, processus interrompable et quotas applicatifs livres ; antivirus reporte par decision documentee. La rasterisation n'est pas une sandbox systeme.
- [x] **24** Implementer et tester la rasterisation et le filigrane nominatif. Lot 54 : ouverture HTTP via Auth AAL2 et Storage reels sur PDF fictif, refus autre agence et suspension ; filigrane long corrige. L'essai Vercel a ensuite revele une police de filigrane absente ; correctif du lot 55 en validation. Le clic navigateur de production reste distinct.
- [x] **25** Journaliser les acces avant restitution ; ecriture seule et separation par dossier testees.
- [x] **26** Tester les interdictions, pannes et transitions. Les sabotages doivent faire echouer les protections concernees. PR51 : journaux explicites sans donnees dynamiques, refus Auth en cas de panne et non-divulgation des erreurs fournisseur couverts.
- [x] **27** Executer les controles en CI, y compris HTTP, concurrence PostgreSQL et renouvellement MFA. Limitation de debit partagee en base.

## Phase 4. Les trois espaces et le parcours contractuel

- [x] **28** Implementer l'espace locataire, le rattachement agence et le suivi sans pieces ni montants.
- [x] **29** Implementer l'espace garant, depot et retrait. PDF fictif depose, restitue identique et retire en production ; journal verifie.
- [x] **30** Implementer le calcul du ratio et figer les donnees qui le determinent selon le cycle du dossier.
- [ ] **31** Terminer l'espace agence jusqu'a l'acte. Consultation et ratio implementes ; generation de l'acte et chaine contractuelle non terminees.
- [x] **32** Implementer la demonstration fictive pour les comptes non actives.
- [x] **33** Implementer demande d'activation et traitement agence, avec refus sur comptes suspendus et membres exclus.
- [ ] **34** Valider modele, generation d'acte, mention, Universign, retour signe, preuve et archivage ensemble. Le compte connecte ne suffit pas. Lounes gere Universign et le modele ; integration et essais techniques dependent de ces elements.
- [ ] **35** Prouver la reception effective des courriels et des liens. Files chiffrees, reprise et transport testes ; expediteur configure, livraison destinataire non prouvee.

## Phase 5. Prerequis avant les justificatifs reels

- [x] **36** Rediger registre des traitements et procedures de droits. Leur validation juridique reste necessaire et distincte de leur presence dans le depot.
- [x] **37** Eprouver la purge SQL et l'effacement Storage par API. Essais reels sur fixtures, reprise apres interruption et maintien de la purge en cas de panne de courriels. Le cache CDN chiffre et la retention des sauvegardes restent distincts.
- [ ] **38** Demontrer une restauration de production et une cle de secours utilisable. Restaurations locales PGlite et PostgreSQL natives reussies ; elles ne couvrent pas Supabase, Storage et Auth de production complets. L'agent prepare les outils et essais ; le detenteur de la cle verifie sa copie de secours.
- [ ] **39** Faire realiser une revue de securite independante ciblee sur les acces, documents et capacites.
- [ ] **40** Valider le suivi des acces anormaux et la prise en charge d'une alerte. Detection agregee et workflow horaire implementes dans le lot 53 ; reception et prise en charge humaine restent a exercer.
- [x] **41** Rediger la procedure de violation de donnees. Responsables, contacts et exercice a confirmer pour le pilote.

## Phase 6. Paiement et facturation

- [x] **42** Exercer le parcours de paiement locataire en mode Stripe test. PR50 : navigateur, Next et PostgreSQL/PostgREST locaux, Checkout et webhook fournisseur ; succes nominal, refus de fonds, annulation, echec puis succes 3D Secure verifies. Aucun encaissement reel. Identite commerciale et configuration du compte de production restent a confirmer avant lancement.
- [ ] **43** Terminer la facturation agence liee a une signature reelle verifiee.
- [x] **44** Tester l'interdiction des chemins de paiement pour le garant.
- [ ] **45** Finaliser et faire valider CGU et CGV. Les brouillons du depot ne valent pas validation.

## Phase 7. Pilote

- [ ] **46** Embarquer les premieres agences selon la procedure ecrite, apres fermeture des prerequis.
- [ ] **47** Valider le canal de support et la capacite a tenir les delais affiches. Une adresse visible ne suffit pas.
- [ ] **48** Mesurer creation, completion et delai jusqu'a signature ; photographie agregee sur 28 jours implementee dans le lot 53 ; reception du lien, historique et signature reelle restent a exercer.
- [ ] **49** Organiser le retour hebdomadaire des agences et alimenter le backlog avec les observations.

## Phase 8. Extension du produit

- [ ] **50** Decider d'un deuxieme cas d'usage apres validation du parcours location.

## Regles produit

Les corrections du plafond, des centimes, de la preparation de mention, de la
deconnexion porteur et du transport PDF sont detaillees dans
[Montants et documents](exploitation/montants-et-documents.md).

- Le garant ne paie jamais.
- Le locataire ne voit ni piece ni montant.
- Le garant retrouve son original ; le filigrane concerne la restitution agence.
- La mention de cautionnement n'est jamais pre-remplie ni suggeree.
- Les acces sont controles cote serveur et en base.
- Les justificatifs expires sont purges ; la conservation de l'acte signe est distincte.
- Les acces aux pieces sont journalises nominativement.

Le versionnement des conditions et l'invalidation de la mention sont decrits dans [le runbook dedie](exploitation/conditions-engagement.md). La migration 0034 exige son deploiement explicite avant le code.

Le [renouvellement du lien du garant](exploitation/reprise-garant.md) reste accessible au locataire apres transmission, sans modification du dossier.

Le [dernier administrateur](exploitation/dernier-administrateur.md) est protege par le lot 0035, avec essais concurrents natifs ; application explicite requise.

Le durcissement des webhooks mutualise la lecture bornee des corps Resend et
Stripe : 64 Kio reels, dix secondes de lecture, annulation du flux et cinq secondes
pour le marquage SQL du paiement. Deux regressions Stripe observees rouges avant
correction, puis 21 tests des routes passes. Ce lot ne constitue pas le registre
comptable ni le rapprochement des paiements, toujours ouverts.

## Mise a jour du 8 septembre, apres PR78

Les migrations jusqu'a 0040 sont appliquees. Le calendrier independant de maintenance
fonctionne et deux executions planifiees ont ete verifiees. Le suivi des courriels
est livre, avec activation Resend externe encore ouverte. Les listes de dossiers
et la gestion des collaborateurs sont livrees. La pagination des historiques est
preparee dans 0041, avec repetition SQL reussie, avant application et fusion.
Les parcours navigateur automatises, les profils documentaires, la rotation des
cles, le rapprochement des paiements et la chaine contractuelle restent ouverts.
Les preuves actualisees sont dans [le suivi des lots](implementation-audit-septembre.md).

La lecture d'enveloppes versionnees et le trousseau de rotation sont prepares,
avec activation distincte de la livraison des lecteurs. Le depot et les courriels
utilisent les memes formats. Le rescellement en masse et la disponibilite des cles
de secours restent ouverts ; voir [Rotation des cles](exploitation/rotation-cles.md).

Le marquage d'un paiement refuse maintenant les confirmations SQL ambigues :
seuls true et false sont des resultats interpretes, toute autre valeur demande
un rejeu HTTP 503. Quatre contre-preuves observees rouges, puis 19 tests du
marquage et de sa route passes. Aucun changement de montant ni remboursement.

Au 8 septembre a 17 h 20, les migrations jusqu'a 0041 sont appliquees et les PR
jusqu'a 82 sont fusionnees, avec CI main verte. Le lot 0042 du registre financier
est prepare et repete sans application ; son etat et ses limites sont detailles
dans le suivi des lots. Les formats de rotation sont livres, mais le rescellement
de masse et la disponibilite des cles de secours restent ouverts.

PR83 est fusionnee et 0042 appliquee, avec CI finale et droits reels verifies.
Le rescellement administratif de masse est prepare avec inventaire, comparaison
atomique et reprise bornee ; sa livraison reste soumise aux controles complets.
La disponibilite effective des cles de secours demeure une condition externe.

PR84 (dependances) et PR85 (rescellement administratif) sont fusionnees. L'outil
permet l'inventaire et le traitement borne avec comparaison atomique ; aucune
rotation reelle ni disponibilite de cle externe n'est declaree prouvee.
Le lot 0043 prepare les profils documentaires et le comptage explicite des
justificatifs dans un fichier. Les repetitions SQL sont passees sans application.
L'examen humain des pieces et les demandes de complement restent a implementer.
Les preuves de livraison actualisees sont dans le suivi des lots.

## Reprise du 9 septembre

Reference distante : main 7b51df4 (PR86). La PR87 est reprise sur ce socle ;
0043 est appliquee, 0044 uniquement repetee avec annulation. La facturation GitHub
bloque le demarrage des workflows et doit etre retablie avant une nouvelle CI de
livraison. Le calendrier Supabase confirme encore la maintenance independamment.
Voir la derniere section du suivi d'implementation et la PR87 pour les preuves.

Le lot 0045 prepare les demandes de complements tracees, leur fourniture par le
garant et leur examen par l'agence. La notification est durable et le locataire
ne lit aucun detail documentaire. La livraison depend de 0044 puis d'une CI verte ;
aucun lot n'est declare applique sur la seule repetition annulee.
Voir [le parcours et ses limites](exploitation/complements-documentaires.md).

Les interactions navigateur des porteurs sont automatisees dans le harnais local :
profil, nombre de documents, falsification du dossier et proposition de complement.
Les controles SQL confirment les mutations sur deux largeurs. Les parcours agence,
upload Storage et fournisseurs reels restent ouverts ; voir le runbook des
[parcours navigateur locaux](exploitation/parcours-navigateur-locaux.md).

Un diagnostic financier administratif par session est prepare : instantane en
lecture seule, rapport prive avec empreinte et refus des extractions excessives.
Il n'effectue aucun mouvement de fonds ni acquittement ; le suivi durable des
decisions reste ouvert. Voir [la procedure](exploitation/diagnostic-paiement.md).

PR87 est fusionnee et 0044 appliquee avec empreinte et droits reels verifies.
Le lot 0045 reste a livrer apres repetition et CI verte de sa revision finale.

Le controle du devis d'une session Stripe ouverte est prepare independamment de
la PR87 : reference, dossier et tarif sont compares avant reprise. Huit refus
vus rouges avant correction, 38 tests cibles verts ; livraison soumise a la CI.
Voir [Reprise de session ouverte](exploitation/reprise-session-ouverte.md).

## Refus borne des webhooks, 9 septembre 2026

Le lecteur commun Stripe et Resend refuse les corps excessifs sans attendre
une annulation de flux potentiellement bloquee ou rejetee. Trois regressions
observees rouges avant correction. Aucune migration ni appel fournisseur.
Voir [les preuves et limites](exploitation/refus-webhooks.md). Livraison en PR
independante, soumise aux controles complets et a une CI verte.

Les lots des PR88 a PR93 sont livres ensemble par la PR94, apres CI verte
de leur combinaison (940 tests, 107 suites, Chromium et PostgreSQL natif).
Les migrations 0044 et 0045 sont appliquees et verifiees avec les roles reels
et leurs empreintes exactes. Elles sont immuables et ne doivent pas etre rejouees.
Le depot public dispose du scan de secrets, de la protection des pushs et du
signalement prive ; le workflow d'historique est inclus dans cette integration.

La validation locale Windows a revele trois tests de diagnostic financier
supposant des droits POSIX. Ces cas restent executes en CI Linux ; le test
commun verifie le refus d'ecriture sans uid POSIX, y compris pour un fichier
existant. Le diagnostic reste volontairement indisponible sur cette plateforme.

Le scanner obligatoire porte sur l'historique complet du candidat. Les anciennes
PR externes sont reservees a l'audit manuel elargi pour ne pas permettre a une
PR independante de bloquer les livraisons. Une contre-preuve avec des cles
fictives confirme l'isolation et la detection d'un secret retire du candidat.

La surveillance memoire des decodeurs Linux est preparee en PR97 : RSS par
processus, budget cumule et refus en cas de panne de mesure. Les limites du tas
V8 sont ainsi completees, sans revendiquer une sandbox ou une limite OS stricte.
Voir [la surveillance documentaire](exploitation/memoire-documentaire.md).

Le socle d'authentification Universign verifie les notifications PS256 et borne
les lectures de clefs publiques. Aucun parcours de signature n'est active.
Les acces developpeur sont en attente ; registre durable, rattachement local,
reconciliation, acte et preuve archives restent a implementer. Voir
[les preuves et limites](exploitation/universign-authentification.md).
