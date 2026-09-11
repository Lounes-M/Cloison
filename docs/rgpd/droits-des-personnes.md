# Traiter une demande de droits

Le registre prive de la migration 0053 suit la reception, la verification, la
reponse et la cloture. Il ne realise ni export personnel ni effacement sur demande.

## Reception et verification

Utiliser le canal de contact effectivement publie et suivi. Conserver la
correspondance dans un outil prive avec ses propres acces et sa conservation.
Ne jamais la copier dans le depot public, une PR ou les journaux applicatifs.

Identifier la personne et le perimetre de maniere proportionnee. Une reference
seule ne prouve pas l'identite. Le canal connu est un element a examiner ; en cas
de doute raisonnable, demander seulement les informations complementaires
necessaires, sans collecte systematique de piece d'identite. Determiner le
responsable du traitement concerne.

Le responsable fixe les echeances de reponse et d'effacement du suivi. Le programme
n'invente ni delai legal ni conservation uniforme. Prolongations, restrictions et
motifs exigent une decision documentee et une reponse a la personne.

## Acces et autres droits

Verifier les donnees du demandeur et les droits des tiers avant restitution.
Le locataire ne recoit pas les pieces, revenus ou engagements du garant. Ne pas
transmettre un export SQL brut du dossier ou du journal contenant des donnees de tiers.

L'export personnel complet et son canal de remise confidentiel restent a
implementer et a valider. La consultation agence n'est pas un export du garant.
Les documents purges ne sont pas recuperables par ce registre. Rectification,
opposition, limitation et portabilite restent a examiner ; un statut ne les execute pas.

## Effacement

Examiner le perimetre, les tiers et les obligations de conservation avant toute
action. Un acte signe ne justifie pas la conservation sans limite de toutes les
pieces. Toute restriction doit etre justifiee et expliquee par le responsable.

La maintenance detruit les cles des justificatifs expires et traite la file
`objets_a_supprimer` dans Storage, avec reprise des echecs. Les actes signes suivent
un traitement distinct. Verifier l'execution et les echecs en attente avant
d'annoncer une destruction : une date d'expiration seule ne la prouve pas.

Examiner aussi les adhesions, affectations et journaux pour une demande sur un
compte agence. Ne pas supprimer globalement un dossier ou un utilisateur a partir
de cette seule procedure. L'effacement individuel avec previsualisation du
perimetre reste ouvert.

## Suivi prive

Voir [le guide operateur](../exploitation/suivi-demandes-droits.md). Une demande
recoit un UUID aleatoire, sans reference locative ni identite dans le registre.
Les preuves restent dans l'outil prive ; seule leur empreinte SHA-256 est inscrite.
La maintenance efface la chaine a sa derniere echeance de conservation. Elle
n'efface pas la correspondance externe ni les exports : ce volet reste a organiser.

## References

- [CNIL : repondre a une demande d'acces](https://www.cnil.fr/fr/repondre-une-demande-de-droit-dacces).
- [RGPD, chapitre III publie par la CNIL](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3).
- [CNIL : durees de conservation](https://cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees).
