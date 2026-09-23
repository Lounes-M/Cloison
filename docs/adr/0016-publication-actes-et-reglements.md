# ADR 0016 : publication des actes et reglement agence

Date : 23 septembre 2026. Statut : accepte pour l'implementation ; ouverture fournisseur soumise a recette.

## Decision

Le projet PDF est prepare par l'agence depuis son modele valide. Cloison lie son empreinte aux conditions courantes et au consentement explicite du garant. Il ne genere pas de mention personnelle ni de modele juridique implicite. Chaque mutation fournisseur est reservee durablement ; une issue inconnue exige un rapprochement, sans nouvel envoi automatique.

Le bucket prive `actes` et la cle par acte sont independants du coffre de justificatifs. Le role Storage `archive_signature` recoit un jeton court limite a un fichier ; il ne lit ni cle ni identite. Le chiffrement AES-GCM authentifie la destination, la nature, la taille et l'empreinte. Un depot repete accepte uniquement les memes octets et n'ecrase aucun objet.

La publication requiert une lecture fournisseur confirmee, l'absence d'anomalie, une revision courante et les deux archives confirmees. Elle seule passe le dossier en signe en production, dans la transaction qui declenche la creance unique. La sandbox ne declenche aucun reglement. Les archives signees se telechargent sans filigrane ni rasterisation, contrairement aux justificatifs vises par l'ADR 0004 : une transformation invaliderait la verification du document signe. La lecture reste autorisee et journalisee.

Le paiement carte agence reprend le tarif historise de la creance. Une tentative durable est reutilisee dans la fenetre d'idempotence Stripe. Webhook et rapprochement relisent la session et la charge avant de confirmer. Les doublons ne creent aucun second reglement. Les erreurs incertaines, remboursements et litiges restent visibles ; aucun prelevement automatique ni remboursement automatique n'est introduit.

## Limites et exploitation

Le modele, la politique de conservation et la recette AES du compte restent des preconditions d'ouverture. L'ecran de reglements n'est pas une facture fiscale. Une capacite garant expiree ne donne plus acces aux archives ; la restitution ulterieure exige le parcours de verification d'identite. Les reprises administratives et echeances sont decrites dans le [guide d'exploitation](../exploitation/parcours-signature.md).
