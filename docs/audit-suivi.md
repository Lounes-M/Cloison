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
reste a deployer. La livraison Resend sur domaine verifie,
l'exercice de restauration et la validation des ecrans authentifies restent a verifier.
Universign affiche toujours un ecran de connexion. Aucun acte n'a ete signe,
aucune facture agence emise, et aucun changement n'a ete fusionne dans main.

La lecture de l’API Supabase ne liste aucune sauvegarde disponible et indique
PITR desactive. Aucun exercice de restauration ni controle de la copie de secours
de CLE_MAITRESSE n’a ete realise.
