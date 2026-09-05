# Suite de l'audit du 5 septembre 2026

Travail en cours sur une PR unique. Ce document remplace l'affirmation selon laquelle
les phases 0 a 7 seraient terminees. Aucun resultat de test local ne vaut preuve de
configuration de production.

## Corrections implementees, en verification

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

## Verification de production en lecture seule

Le 5 septembre, le projet Supabase Cloison contient zero dossier et zero piece.
La migration 0019 n'est pas appliquee : anon possede encore l'emission de jetons,
et le role serveur ne la possede pas. pg_cron n'est pas installe.
Vercel et Stripe CLI sont connectes. Les secrets Production sensibles de Vercel
ne peuvent pas etre exportes : ils n'ont pas ete remplaces pour contourner cette protection.

## Points restant ouverts dans cette PR

- Tests complets, build, integration reelle, migrations et verification du deploiement.
- Modele contractuel valide, generation d'acte, chaine Universign et facturation agence.
- Integration Universign et tests complets du parcours contractuel dependants du modele valide.
- Documentation d'exploitation, restauration et validation des nouveaux ecrans.

La fusion attend les verifications et la CI. Les elements dependants d'un compte,
d'un texte contractuel ou d'une configuration doivent etre identifies sans etre marques termines.

## Preuves de verification

La premiere serie de corrections (commit cea327a) a passe 360 tests, le build,
la CI GitHub et la previsualisation Vercel. La seconde serie passe egalement le controle complet : 365 tests dans 36 suites.
Le script `scripts/test-postgrest.mjs` verifie par HTTP les claims JSON, la
revocation, le refus des signatures falsifiees et l'absence d'acces anonyme.
Il a ete execute avec PostgreSQL 17 et PostgREST 16.2 locaux ; une tache CI le rejoue.
Le harnais Storage reste minimal : ce test ne prouve pas le fonctionnement du
service Storage Supabase complet.

Aucune migration 0019 a 0027 n'a encore ete appliquee en production.
CRON_SECRET est configure dans Vercel Production et GitHub Actions. La route
reste a deployer. L'expediteur Resend est configure ; la livraison effective,
l'exercice de restauration et la validation des ecrans authentifies restent a verifier.
La connexion Universign est confirmee le 6 septembre dans le workspace Cloison. Aucun acte n'a ete signe,
aucune facture agence emise, et aucun changement n'a ete fusionne dans main.

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
Le plan de quatorze migrations a passe une repetition transactionnelle sur Supabase,
terminee par annulation et verification distincte. Aucun changement de schema n'est conserve.
Le script `scripts/preparer-rattrapage-production.mjs` fournit le SQL unique et ses
preconditions ; voir `docs/exploitation/rattrapage-production.md` pour l'application.
