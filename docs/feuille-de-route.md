# Feuille de route Cloison

> Reouverture apres audit du 5 septembre 2026 : les cases historiques ci-dessous
> ne valent pas validation du produit. Etat corrige et travaux en cours : [suivi de l’audit](audit-suivi.md).

De la landing en ligne au premier acte de cautionnement signé pour de vrai. Neuf phases, dans l'ordre, chacune débloquant la suivante. Export du 4 septembre 2026 ; la version vivante est l'artefact `https://claude.ai/code/artifact/64a581c3-18ff-4255-86ac-735d5523dc7e`.

Légende : `[x]` fait ; `[ ]` à faire ; **À toi** attend un compte, un conseil ou un geste de Lounes ; **Juridique** à faire valider par un professionnel ; **Décision** à trancher, pas à coder.

## Phase 0. Finir le socle (Terminee)

Les trois scories du setup, plus la mise en ligne. Le site est en production sur cloison.vercel.app, puis sur cloison.immo depuis le 5 septembre 2026, vérifié après coup : les six en-têtes de sécurité sont servis, sitemap et robots citent le bon domaine, l'image de partage se génère avec la vraie typographie, et rien ne déborde en 390 px. Ajoutés au passage, hors liste : les en-têtes de sécurité et un garde-fou qui empêche un secret de partir vers le navigateur.

- [x] **01** Supprimer components/ui/Badge.tsx
      Composant mort, jamais importé. Le code non utilisé se met à mentir très vite.
- [x] **02** Ajouter app/error.tsx et app/global-error.tsx
      Aujourd'hui une erreur runtime affiche l'écran par défaut de Next, pas ta marque.
- [x] **03** Activer Dependabot sur npm et github-actions
      Un produit qui manipulera des avis d'imposition ne peut pas dépendre de ta vigilance pour les patchs.
- [x] **04** Déployer sur Vercel, brancher le domaine, définir NEXT_PUBLIC_SITE_URL
      Sans l'URL de production, sitemap, robots et Open Graph pointent vers localhost.
- [x] **05** Vérifier l'apparition au scroll dans un vrai navigateur
      Le seul point du setup que je n'ai pas pu valider : le navigateur intégré gardait son onglet masqué, ce qui gèle l'IntersectionObserver.

## Phase 1. Rendre la landing capable de convertir (4 / 5 faites)

La landing capte désormais. La page /agences est en ligne, le formulaire écrit dans Supabase et notifie par e-mail, vérifié en production, doublon et refus d'adresse personnelle compris. Reste la page juridique, volontairement reportée faute de structure immatriculée ; le formulaire porte en revanche l'information au moment de la collecte, qui est une obligation distincte.

- [x] **06** Formulaire agence : nom, email pro, ville, nombre de dossiers par an
      Le champ « dossiers par an » qualifie le lead tout seul. Une agence à cent dossiers ne se traite pas comme une à dix.
- [x] **07** Page /agences dédiée
      Le bouton « Je suis une agence » existe déjà dans le hero ; la page derrière, non.
- [ ] **08** Mentions légales et politique de confidentialité **Juridique**
      Reportée volontairement : les mentions légales exigent une structure immatriculée. L’information des personnes au moment de la collecte, qui est une obligation distincte et n’en dépend pas, figure sous le formulaire.
- [x] **09** Choisir une mesure d'audience sans cookie
      Certaines solutions sans cookie peuvent être exemptées de bandeau de consentement, à confirmer avec ton conseil. Une landing sur la confidentialité qui s'ouvre sur un bandeau de tracking se contredit toute seule.
- [x] **10** Vérifier le rendu de l'aperçu de partage sur LinkedIn et WhatsApp
      L'image Open Graph est générée au build ; elle n'a jamais été vue en conditions réelles.

## Phase 2. Trancher l'architecture (Tranchée)

Sept décisions, zéro ligne de code, écrites dans docs/adr/ : le contexte, l'option retenue, ce qu'on abandonne. Coder avant de les trancher revenait à les trancher par accident, et à les découvrir en production. Six sont prises.

- [x] **11** Le modèle d'accès : ADR 0002 et 0006
      La règle retenue retourne l'intuition : l'inscription est libre, ce qui est contrôlé c'est le droit d'envoyer un lien à un vrai garant. Filtrer à l'inscription protégeait le mauvais èvenement.
- [x] **12** La matrice qui-voit-quoi : ADR 0002
      Portée par le rôle Postgres et non par un claim lu dans une politique : une règle écrite to authenticated reste inatteignable par un porteur de lien, quelle que soit l'erreur commise ailleurs. Le détail champ par champ arrive avec le schéma des dossiers.
- [x] **13** Stockage et chiffrement : ADR 0003
      Chiffrement par enveloppe, et le point qui porte tout : le chiffré chez Supabase, la clé chez Vercel. Compromettre l'un ne donne rien sans l'autre. L'effacement à trois mois devient cryptographique.
- [x] **14** Signature électronique : ADR 0005
      Signature avancée chez un prestataire capable de qualifié. Et la conséquence produit la plus contre-intuitive : la mention ne sera jamais pré-remplie, sous peine de livrer un acte nul.
- [x] **15** Filigranage et trace : ADR 0004
      Nominatif, et rasterisé plutôt qu'estampillé : un filigrane amovible donne l'illusion de la protection, ce qui est pire que rien. Effet de bord gagné au passage, la rasterisation détruit tout contenu actif d'un PDF déposé.
- [x] **16** Base de données et hébergement : ADR 0001
      Supabase en périmètre restreint, région UE : Postgres, Storage et RLS, mais pas Auth pour le garant ni le locataire.
- [ ] **17** Liste des sous-traitants et contrats associés **Juridique**
      Le seul point encore ouvert de la phase. Supabase, Vercel, Resend et le prestataire de signature touchent tous à des données personnelles. L'ADR 0005 note explicitement que son contrat reste à passer.

## Phase 3. Le socle technique (Terminée)

Rien de visible pour l'utilisateur, tout ce sur quoi les deux portes reposent. Tout est livré : routes séparées, schéma et RLS testés par interdiction, entrée par le domaine, jetons de capacité, enveloppe avec la clé chez Vercel, rasterisation filigranée, journal en écriture seule, tests PGlite dans la CI, débit partagé. L'antivirus seul est reporté, la rasterisation neutralisant déjà tout contenu actif ; c'est inscrit dans docs/dettes.md.

- [x] **18** Groupes de routes (marketing) et (app)
      Sépare le site public de l'applicatif, avec des layouts et des règles d'accès distincts.
- [x] **19** Schéma des dossiers, des pièces et de leurs politiques RLS
      La migration 0002 pose déjà les agences, les membres et les trois rôles Postgres. Restent les tables qui portent réellement le cloisonnement, et c'est là que la matrice de la tâche 12 devient du SQL.
- [x] **20** Supabase Auth pour l'agence : inscription libre, rattachement par domaine, MFA
      Absent de la version précédente de cette liste, alors que l'ADR 0002 en fait la porte d'entrée de l'acheteur. Le domaine étant l'invitation, il n'y a pas de table d'invitations à écrire, mais la reprise d'espace existant est un cas à ne pas rater.
- [x] **21** Jetons de capacité pour le garant et le locataire, rôle porteur_lien
      ADR 0002 et 0006. Le lien est réémissible, le jeton ne l'est pas : redemander son lien révoque le précédent, sinon un vieux message rouvrirait un dossier des mois plus tard.
- [x] **22** Chiffrement par enveloppe : une clé par dossier, la clé maîtresse chez Vercel
      Le point qui porte l'ADR 0003, et qui n'apparaissait nulle part ici. Compromettre Supabase ne doit rien donner sans la clé, qui vit ailleurs.
- [x] **23** Dépôt de pièces : contrôle de type réel et analyse antivirus
      Le contrôle de type réel est livré, par les octets et non par l'extension. L'antivirus est reporté : la rasterisation détruit déjà tout contenu actif, et c'est écrit dans docs/dettes.md.
- [x] **24** Rasterisation et filigranage nominatif
      Chantier entier absent de la version précédente, où le filigrane passait pour un attribut de l'écran agence. C'est un pipeline : chaque page rendue en image, composée avec le filigrane, réassemblée en PDF. Et un piège juridique : MuPDF et ses dérivés sont sous AGPL, dont la clause réseau contaminerait tout le produit.
- [x] **25** Journal d'accès en écriture seule
      Sur un produit dont la promesse est le cloisonnement, ce n'est pas du logging technique : c'est une fonctionnalité, et probablement un argument de vente. Le même point de passage déchiffre, filigrane et trace.
- [x] **26** Lanceur de tests, et les règles d'accès couvertes en premier
      Pas l'interface. Les tests qui comptent ici répondent à « le locataire peut-il atteindre un montant ? ». Le harnais Postgres local de supabase/essais/ sert déjà à ça.
- [x] **27** Tests dans npm run check et la CI, et limitation de débit partagée
      Un test qui ne tourne pas à chaque push finit par ne plus tourner du tout. La dette de limitation de débit arrive ici à échéance : ce qu'elle protégera n'est plus un formulaire de contact mais des liens d'accès.

## Phase 4. Les deux portes et les trois espaces (7 / 8 faites)

Le produit a deux portes d'entrée qui débouchent sur le même dossier. Le locataire arrive par un lien magique, ouvre son dossier et désigne son garant. L'agence arrive par un compte, rattachée à son domaine, et envoie elle-même les liens. L'ordre de construction suit le parcours réel : le locataire ouvre, le garant dépose, l'agence décide. Tout est livré sauf la signature, qui attend un compte Universign.

- [x] **28** Espace locataire : créer le dossier, désigner le garant, suivre l'avancement
      La porte principale. Il ne voit ni pièce ni montant, seulement un feu vert : le plus simple à coder et le plus facile à rater, une fuite dans une réponse d'API casse la promesse entière.
- [x] **29** Espace garant : dépôt des pièces, ce qu'il couvre, combien, jusqu'à quand
      C'est là que se joue l'essentiel de l'abandon. Si le dépôt est pénible, il n'y a pas de produit, et c'est le locataire qui devra relancer son oncle.
- [x] **30** Calcul du ratio de solvabilité
      La première vraie logique métier, donc la première qui mérite de vrais tests. Le seuil retenu est une décision, pas une constante à glisser dans le code.
- [x] **31** Espace agence : lecture filigranée, ratio, acte pré-rempli
      L'écran de démonstration. Il consomme le pipeline de la tâche 24 plutôt que de le contenir.
- [x] **32** Dossier de démonstration pour les comptes non activés
      Absent de la version précédente, et pourtant c'est lui qui rend l'inscription ouverte autre chose qu'un décor. Un compte non vérifié a le produit entier sur un faux dossier : tout, sauf l'envoi d'un lien réel.
- [x] **33** Demande d'activation d'une agence, et son traitement
      La barrière de l'ADR 0002 tombe ici, et nulle part avant. Une demande arrive avec l'historique de ce que l'agence a essayé sur la démonstration : c'est un prospect qualifié, pas un formulaire de contact.
- [ ] **34** Saisie guidée de la mention, puis signature électronique **À toi**
      La saisie guidée est livrée : quatre éléments affichés, mention composée par le garant, chiffres vérifiés contre lettres, jamais pré-remplie. La signature attend un compte Universign, le seul geste qui manque.
- [x] **35** E-mails transactionnels, livraison des liens comprise
      « Pas de relance » est une promesse de la page d'accueil. Elle se tient avec des notifications justes, pas avec le silence. C'est aussi le canal qui porte les liens magiques.

## Phase 5. Avant le premier dossier réel (4 / 6 faites, Bloquant)

À partir d'ici tu manipules des bulletins de paie et des avis d'imposition appartenant à des tiers qui n'ont rien demandé à personne. Cette phase ne se reporte pas après le pilote : elle se termine avant le premier vrai document. Côté dépôt, elle est terminée : purge prouvée, registre, procédures. Restent la restauration réellement effectuée et la revue externe, qui ne s'écrivent pas.

- [x] **36** Registre des traitements et procédure de droit d'accès et d'effacement
      Écrits dans docs/rgpd/ : le registre des traitements et la procédure de droit d'accès et d'effacement, sur trois mois. À faire valider par un conseil, ce que le dépôt ne peut pas tenir à ta place.
- [x] **37** Prouver que la purge à trois mois fonctionne, par un test automatisé
      La différence entre une politique de rétention et une intention, c'est exactement ce test. Attention au piège : l'acte signé échappe à la règle, un test qui le purgerait validerait un bug.
- [ ] **38** Sauvegardes chiffrées et une restauration réellement effectuée **À toi**
      La procédure est écrite dans docs/exploitation/sauvegardes-et-restauration.md, clé maîtresse comprise. La restauration réellement effectuée, elle, n'a pas encore eu lieu : un geste à toi, à dater.
- [ ] **39** Revue de sécurité externe, ciblée sur le cloisonnement et les liens d'accès **À toi**
      Le périmètre, les questions à poser et ce qu'un auditeur doit recevoir sont dans docs/exploitation/revue-de-securite.md. Reste à choisir qui la fait.
- [x] **40** Alerting sur les accès anormaux
      Les requêtes hebdomadaires sont dans docs/exploitation/acces-anormaux.md, avec ce qu'il faudrait pour qu'une alerte parte seule. Le pays n'est pas conservé, par choix.
- [x] **41** Procédure écrite en cas de violation de données
      Elle s'écrit à froid. Le jour où elle sert, on n'a plus le temps de la rédiger.

## Phase 6. Encaisser (3 / 4 faites)

Le modèle est vrai, et tenu par la base : 9 € pour le locataire, 29 € par acte, rien pour le garant. Il ne reste qu'à créer le compte Stripe et poser ses deux clés.

- [x] **42** Paiement locataire, une fois, pour un dossier valable trois mois
      Décidé et livré : 9 €, une fois, après l'ouverture et avant le lien du garant, sans remboursement, dit avant de payer. C'est emettre_jeton qui refuse le lien tant que ce n'est pas réglé, pas l'écran. Restent chez toi le compte Stripe, ses deux clés et le webhook.
- [ ] **43** Facturation agence à l'acte, collaborateurs illimités et gratuits **À toi**
      La ligne de 29 € se crée seule au passage à signé, jamais pour une démonstration, et un dossier facturé ne se purge pas. Les collaborateurs sont illimités et gratuits par construction. L'encaissement attend l'acte, donc Universign.
- [x] **44** Un test qui échoue si un chemin de paiement devient atteignable par un garant
      « Le garant ne paie jamais, sinon ça ne part pas » est affiché sur ta page d'accueil. Une règle d'or qui ne vit que dans la documentation n'est pas une règle.
- [x] **45** Conditions générales d'utilisation et de vente
      Un brouillon technique par acteur, dans docs/juridique/, marqué à confirmer partout où le droit tranche. À faire relire par un conseil avant le premier dossier réel.

## Phase 7. Le pilote (les 6 mois annoncés, À toi)

Trois villes tendues, vingt agences, six mois : c'est ton propre objectif, affiché sur la page. À ce stade le produit compte moins que la boucle de retour. La procédure est écrite dans docs/exploitation/ : embarquer, répondre, mesurer, décider. Le pilote lui-même ne se code pas.

- [ ] **46** Embarquer les premières agences à la main **À toi**
      Sept étapes dans docs/exploitation/embarquement-agence.md, de la demande sur la page d'accueil à l'activation en un seul ordre SQL, avec ce qu'on vérifie et ce qu'on note.
- [ ] **47** Un canal de support direct, avec un vrai délai de réponse **À toi**
      Une adresse et un délai tenu : quatre heures ouvrées pour un dossier bloqué, un jour ouvré pour le reste. L'affichage est prêt depuis le 5 septembre 2026 : dès que `EMAIL_SUPPORT` est posée dans Vercel, l'espace agence la montre en bas de page et les courriels du locataire et du garant y répondent. Reste à fixer l'adresse.
- [ ] **48** Suivre : dossiers créés, taux de complétion du garant, délai dépôt vers signature **À toi**
      Les trois requêtes sont écrites dans docs/exploitation/suivi-du-pilote.md, sur le schéma réel. À passer chaque semaine, et à noter : la purge à trois mois efface le journal.
- [ ] **49** Un point hebdomadaire retours vers backlog **À toi**
      Une heure, le même jour, trois parties, un seul endroit : les trois nombres, les retours, ce qu'on décide. Le jour et l'endroit sont à choisir.

## Phase 8. Le reste du coffre (pas avant)

Ta page de vision liste déjà la suite : caution bancaire, hébergeant pour un visa, parents pour le Crous, grands-parents pour la crèche. Même gêne, même besoin, même coffre.

- [ ] **50** Ouvrir un deuxième cas d'usage, uniquement quand la location tourne seule **Décision**
      La location est le premier cas, pas le seul. Mais un produit à deux cas mal faits ne convainc aucune des deux audiences.

## Sept règles qui ne se négocient pas

- Le garant ne paie jamais. Aucun parcours, aucun écran, aucune exception.
- Le locataire ne voit ni une pièce, ni un montant. Seulement un statut.
- Le garant ne voit jamais ses propres pièces dégradées. Le filigrane s'applique à la sortie vers l'agence, pas au dépôt.
- La mention de cautionnement n'est jamais pré-remplie ni suggérée. Le garant la compose, le serveur la vérifie.
- Toute lecture vérifie le rôle côté serveur. Jamais un filtrage côté client, jamais une route devinable.
- Une pièce arrivée à échéance est détruite, pas masquée. L'acte signé est la seule exception.
- Tout accès à une pièce laisse une trace nominative, en écriture seule.

### Reprise apres audit, 6 septembre 2026

Le detail des corrections et preuves vit dans `docs/audit-suivi.md`. Le traitement
documentaire est deplace dans un processus interrompable avec limites de ressources.
Les phases contractuelles ne sont pas terminees : Lounes prend en charge l'activation
Universign et le modele d'acte ; l'integration et sa validation dependent de ces elements.

La PR 43 est fusionnee, deployee et ses migrations sont appliquees. Les controles
HTTP refusent les fonctions sensibles au role anonyme. Le suivi de livraison
corrige la verification de maintenance et les erreurs documentaires journalisables.
Les cases historiques ne prouvent toujours ni restauration reelle ni signature.

La passe suivante ajoute des preuves de restauration locale et de Storage reel,
la reprise durable des retraits, le traitement des pannes de pages et la fiabilite
des notifications. Voir `docs/audit-suivi.md` pour la livraison et les limites.
La restauration de production, le parcours navigateur authentifie complet et la
chaine contractuelle ne deviennent pas termines par ces seules preuves.
