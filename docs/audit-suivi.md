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

## Verification de production en lecture seule

Le 5 septembre, le projet Supabase Cloison contient zero dossier et zero piece.
La migration 0019 n'est pas appliquee : anon possede encore l'emission de jetons,
et le role serveur ne la possede pas. pg_cron n'est pas installe.
Vercel et Stripe CLI sont connectes. Les secrets Production sensibles de Vercel
ne peuvent pas etre exportes : ils n'ont pas ete remplaces pour contourner cette protection.

## Points restant ouverts dans cette PR

- Tests complets, build, integration reelle, migrations et verification du deploiement.
- Modele contractuel valide, generation d'acte, chaine Universign et facturation agence.
- Livraison durable des notifications, journal visible au garant et controles complementaires.
- Documentation d'exploitation, restauration et validation des nouveaux ecrans.

La fusion attend les verifications et la CI. Les elements dependants d'un compte,
d'un texte contractuel ou d'une configuration doivent etre identifies sans etre marques termines.
