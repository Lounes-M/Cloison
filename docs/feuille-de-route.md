# Feuille de route Cloison

De la landing au premier dossier reel allant jusqu'a un acte signe.
Version actualisee au 20 octobre 2026, sur main apres PR205. Le
[suivi d'audit](audit-suivi.md) conserve les preuves et la chronologie ; les
mises a jour datees de septembre sont regroupees dans
[l'historique de la feuille de route](historique-feuille-de-route.md).

Une case cochee signifie que l'element decrit est realise selon la preuve indiquee.
Une implementation seule ne termine pas une tache exigeant une livraison ou un
parcours reel. Aucun total de cases ne mesure la preparation au lancement.
Youtrust et le modele contractuel sont pris en charge par Lounes ; le reste
avance techniquement sans attendre cette dependance.

## Etat au 20 octobre 2026

Les migrations sont preparees jusqu'a 0063 ; 0062 reste un prototype de
recuperation MFA en revue. Depuis septembre, la chaine de l'acte, l'archivage
chiffre et la facturation agence sont livres fermes par defaut (ADR 0015 et
0016). Les exports et retraits individuels des droits sont livres. Aucune de
ces fonctions n'a encore ete exercee avec un fournisseur reel.

Ce qui reste se repartit en trois groupes :

- **Technique, sans dependance externe** : brancher la cible documentaire
  confinee (23), actualiser le brief de revue de securite (39), completer les
  parcours navigateur agence et l'audit d'accessibilite (F20), suivre les
  dependances et dettes d'outillage ([dettes](dettes.md)).
- **Comptes et operations de Lounes** : compte Youtrust avec AES et recette
  (31, 34), domaine Resend et reception reelle (35), sauvegardes Supabase et
  copie de la cle maitresse (38), revue externe commandee (39), reception des
  alertes (40), identite Stripe de production (43), apercus sociaux (10),
  support et pilote (46 a 49), puis le deuxieme cas d'usage (50).
- **Juridique** : mentions legales et confidentialite (08), sous-traitants (17),
  modele d'acte, mention et duree de conservation de l'acte (34), validation du
  registre et des procedures de droits et de violation (36, 41), CGU et CGV
  (45), textes de mesure d'audience (09).

Les guides d'exploitation sont references depuis le [sommaire de la documentation](README.md),
dont [l'expiration des acces agence](exploitation/expiration-acces.md) et les
[budgets de maintenance](exploitation/budgets-maintenance.md).

## Phase 0. Socle et presence publique

- [x] **01** Supprimer le composant Badge inutilise.
- [x] **02** Ajouter les pages d'erreur applicatives et globales.
- [x] **03** Activer Dependabot. Les incompatibilites d'outillage restent suivies dans les dettes.
- [x] **04** Deployer Vercel et le domaine. Le domaine canonique est www.cloison.immo.
- [x] **05** Verifier les animations au scroll dans un navigateur. PR50 : les 16 blocs Reveal de / et les 17 de /agences se revelent sur ordinateur et mobile ; mouvement reduit et fallback sans JavaScript visibles, bascule Parcours au clavier sans JavaScript verifiee.

## Phase 1. Landing et collecte

- [x] **06** Implementer le formulaire agence, ses controles et la persistance. La livraison des courriels se valide en tache 35.
- [x] **07** Livrer la page /agences. Lot 57 : presentation du pilote et tarifs explicites, liens de creation fonctionnels, verification des pages publiques sur mobile/ordinateur ; voir la PR pour la livraison effective.
- [ ] **08** Finaliser et faire valider les mentions legales et la politique de confidentialite. Aucune page n'est publiee : les mentions attendent la structure immatriculee, la politique doit couvrir les sous-traitants de la tache 17. Les textes provisoires ne ferment pas cette tache.
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
- [ ] **17** Verifier la liste des sous-traitants et leurs contrats avec le conseil competent : Supabase, Vercel, Resend, Stripe, Youtrust, OpenRouter et GitHub. Stripe, OpenRouter et GitHub n'apparaissent pas encore dans le [registre des traitements](rgpd/registre-des-traitements.md), a completer avant cette verification.

## Phase 3. Socle technique et preuves d'acces

- [x] **18** Separer les routes marketing et les espaces applicatifs.
- [x] **19** Implementer dossiers, pieces, roles et RLS. Migrations appliquees jusqu'a 0031, refus controles par SQL, HTTP et Storage.
- [x] **20** Verifier rattachement, MFA, renouvellement, suspension et exclusion dans un navigateur avec Supabase Auth reel. PR52 : build local, comptes fictifs, entree technique sans courriel ; deconnexion reelle et panne simulee verifiees. La reception du lien magique de production reste en tache 35.
- [x] **21** Implementer les capacites locataire/garant et leur revocation. Les essais refusent un cookie et un lien revoques.
- [x] **22** Chiffrer les pieces avant Storage avec une cle scellee par dossier. La copie de secours de la cle maitresse reste a prouver.
- [ ] **23** Completer le perimetre de validation documentaire. Type reel, decodage, dimensions, processus interrompable, surveillance memoire et quotas applicatifs livres ; antivirus reporte par decision documentee. La [cible Linux confinee](exploitation/isolation-documentaire-linux.md) est preparee (PR132) mais n'est pas branchee en production : son hebergement, sa validation et un budget de capacite du service restent a realiser. Le processus actuel n'est pas une sandbox systeme.
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
- [ ] **34** Valider modele, generation d'acte, mention, Youtrust, retour signe, preuve et archivage ensemble. Le compte connecte ne suffit pas. Lounes gere Youtrust et le modele ; integration et essais techniques dependent de ces elements.
- [ ] **35** Prouver la reception effective des courriels et des liens. Files chiffrees, reprise et transport testes ; expediteur configure, livraison destinataire non prouvee.

## Phase 5. Prerequis avant les justificatifs reels

- [x] **36** Rediger registre des traitements et procedures de droits. Suivi prive des demandes (0053), export personnel chiffre, remise a acces temporaire et retrait individuel des justificatifs livres (PR183 a PR189, 0063) ; une recette du bucket reel precede la premiere remise. Leur validation juridique reste necessaire et distincte de leur presence dans le depot.
- [x] **37** Eprouver la purge SQL et l'effacement Storage par API. Essais reels sur fixtures, reprise apres interruption et maintien de la purge en cas de panne de courriels. Le cache CDN chiffre et la retention des sauvegardes restent distincts.
- [ ] **38** Demontrer une restauration de production et une cle de secours utilisable. Restaurations locales PGlite et PostgreSQL natives reussies, lectures de sauvegardes bornees (PR131) ; elles ne couvrent pas Supabase, Storage et Auth de production complets. Au 5 septembre, l'API Supabase ne listait aucune sauvegarde et PITR etait desactive. L'agent prepare les outils et essais ; le detenteur de la cle verifie sa copie de secours.
- [ ] **39** Faire realiser une revue de securite independante ciblee sur les acces, documents et capacites. Le [brief](exploitation/revue-de-securite.md) doit d'abord integrer la chaine de signature, les archives d'actes et les remises de droits livrees depuis septembre.
- [ ] **40** Valider le suivi des [acces anormaux](exploitation/acces-anormaux.md) et la prise en charge d'une alerte. Detection agregee et workflow horaire implementes dans le lot 53 ; reception d'un echec par Lounes, relais en son absence et prise en charge humaine restent a exercer.
- [x] **41** Rediger la procedure de violation de donnees. Responsables, contacts et exercice a confirmer pour le pilote.

## Phase 6. Paiement et facturation

- [x] **42** Exercer le parcours de paiement locataire en mode Stripe test. PR50 : navigateur, Next et PostgreSQL/PostgREST locaux, Checkout et webhook fournisseur ; succes nominal, refus de fonds, annulation, echec puis succes 3D Secure verifies. Aucun encaissement reel. Identite commerciale et configuration du compte de production restent a confirmer avant lancement.
- [ ] **43** Terminer la facturation agence liee a une signature reelle verifiee.
- [x] **44** Tester l'interdiction des chemins de paiement pour le garant.
- [ ] **45** Finaliser et faire valider CGU et CGV. Les brouillons du depot ne valent pas validation.

## Phase 7. Pilote

- [ ] **46** Embarquer les premieres agences selon la procedure ecrite, apres fermeture des prerequis.
- [ ] **47** Valider le canal de support et la capacite a tenir les delais affiches. Le [support contextuel](exploitation/support-contextuel.md) des trois espaces est livre (PR108) ; le canal, la personne qui repond et les delais restent a confirmer. Une adresse visible ne suffit pas.
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
comptable ni le rapprochement des paiements, traites par des lots ulterieurs
(voir [l'historique](historique-feuille-de-route.md)).
