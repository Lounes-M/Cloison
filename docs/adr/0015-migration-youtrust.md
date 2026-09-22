# ADR 0015 · Migration de la signature vers Youtrust

**Date** : 22 septembre 2026
**Statut** : acceptee pour le fournisseur et son adaptateur technique
**Remplace** : le choix fournisseur de l [ADR 0005](0005-signature-electronique-de-l-acte.md)

## Decision

Youtrust (ex-Yousign) remplace Universign. Les domaines techniques officiels restent
`api-sandbox.yousign.app` et `api.yousign.app`, sous `/v3`. Il ne faut pas les renommer
en domaines deduits du nom commercial. Aucun retour automatique a Universign.

Le perimetre existant etait un verificateur de notifications et un diagnostic en
lecture seule. Aucune route publique de signature, transaction metier persistante,
facturation apres signature ou archive contractuelle ne dependait de cet adaptateur.
Il n'y a donc pas de migration SQL ni de transfert automatique d'actes existants.

Le nouvel adaptateur propose la creation d'un brouillon, le depot du PDF, l'ajout
d'un signataire avec signature avancee et OTP SMS, l'activation separee, la lecture,
l'annulation explicite et la recuperation de l'acte et des preuves PDF. L'API gere
la verification d'identite ; aucune delegation de verification a Cloison et aucun
repli vers une signature simple. L'envoi initial est confie a Youtrust par email.

## Raisons et conditions commerciales

L'API documente les notifications authentifiees, les preuves et les environnements
distincts. L'offre propose un essai sandbox ; la signature avancee en sandbox exige
une activation par leur support. La creation d'un compte ne prouve pas cette activation.

La comparaison tarifaire de l'ADR precedent melangeait des offres web et API.
Le devis a confirmer doit couvrir l'usage editeur, l'avancee, la verification
d'identite, les demandes abandonnees, le volume et l'archivage. Les credits sont
consommes par signataire a l'envoi, pas uniquement a la signature. La conservation
du dossier de preuve ne signifie pas que l'archivage du document signe est inclus.

## Frontieres et ouverture du parcours

Les mutations sont desactivees par defaut. Les modules sont exclusivement serveur.
Les identifiants, etats et reponses sont valides ; les origines sont fixes, les
redirections interdites, les lectures et delais bornes. Les erreurs ne revelent
ni identite, ni corps fournisseur, ni cle. Les mutations ne sont jamais rejouees.
`external_id` permet un rapprochement mais n'assure pas l'idempotence.

L'adaptateur n'autorise pas un utilisateur a signer un dossier. Il faut encore
raccorder le modele valide, la mention saisie par le garant, les autorisations
et versions du dossier, un registre durable des demandes et notifications,
la reprise des operations incertaines, l'archivage chiffre et la facturation.
Il ne faut pas exposer une route publique qui acquitte les notifications avant
leur enregistrement durable. `done` ne constitue pas une preuve d'archivage local.

Les tests simules ne prouvent ni l'activation du compte ni la validite juridique
du modele. Une recette sandbox complete reste necessaire avant ouverture.

## References

- [Cycle API](https://developers.youtrust.com/docs/create-your-first-signature-request)
- [Signature avancee](https://developers.youtrust.com/docs/advanced-esignature-new)
- [Notifications](https://developers.youtrust.com/docs/use-webhooks-in-your-app)
- [Preuves](https://developers.youtrust.com/docs/audit-trails-new)
- [Offre API](https://youtrust.com/fr-fr/prix-api)
- [Exploitation](../exploitation/youtrust-authentification.md)
