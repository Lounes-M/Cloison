# Procédure : droit d'accès et droit à l'effacement

Tâche 36. Comment répondre, concrètement et dans le mois, à un locataire, un garant ou un
collaborateur d'agence qui exerce ses droits. Chaque étape cite l'outil ou la requête qui la
réalise : une procédure qui dit « supprimer les données » sans dire comment n'en est pas une.

## Recevoir la demande

Par courriel à l'adresse de contact (**à créer** : `rgpd@…`). Accuser réception sous une semaine.
Vérifier l'identité par le canal déjà connu : une demande venant de l'adresse e-mail portée par le
dossier suffit pour un locataire ou un garant, puisque c'est ce canal qui lui a livré son lien.
Pour toute autre adresse, demander un élément du dossier (sa référence).

## Droit d'accès

Ce que la personne peut obtenir, et où le lire.

**Un locataire** : les colonnes de `dossiers` qui le concernent, et le journal. Rien des pièces ni
de l'engagement du garant, qui ne sont pas ses données.

```sql
select reference, email_locataire, locataire_nom, loyer_cents, statut, cree_le, expire_le
  from public.dossiers where email_locataire = '…';
select action, acteur, quand from public.journal_acces
 where dossier_id in (select id from public.dossiers where email_locataire = '…');
```

**Un garant** : sa ligne d'`engagements`, la liste de ses pièces (nature, taille, date), le
journal de son dossier, et ses pièces elles-mêmes. Les pièces sont chiffrées : elles se restituent
en les ouvrant avec la clé maîtresse, depuis le serveur, comme le fait `ouvrirPiecePourLAgence`,
mais **sans filigrane et sans rasterisation** : la personne reçoit ses documents, pas une
photographie. Ce chemin n'existe pas encore dans le code (**à écrire** : une fonction
`restituerAuGarant`, réservée à l'exploitant, journalisée).

**Un collaborateur** : sa ligne dans `auth.users` et `membres_agence`, et les entrées du journal
où `acteur_id` est le sien.

Format : un export texte ou JSON, envoyé chiffré ou déposé derrière un lien à usage unique. Délai :
un mois.

## Droit à l'effacement

**Un locataire ou un garant demande l'effacement de son dossier.** La suppression du dossier
emporte tout par cascade, clé comprise : c'est l'effacement cryptographique de l'ADR 0003, le même
que la purge.

```sql
delete from public.dossiers where id = '…';
```

Deux limites à dire à la personne. Si l'acte de cautionnement a été signé, le dossier est un
contrat qui survit au bail (ADR 0005) : l'effacement ne s'applique pas à l'acte, et la demande est
refusée pour cette partie, avec le motif. Et les octets physiques dans Storage ne sont pas
effacés par la suppression de la ligne : ils sont inertes sans la clé, et `docs/dettes.md` trace ce
point.

**Un collaborateur demande l'effacement de son compte.** Supprimer l'utilisateur depuis
Authentication dans Supabase : `membres_agence` cascade. Les entrées du journal qui portent son
`acteur_id` restent, sans le nom : le journal est en écriture seule, et une trace qui disparaît
avec son auteur ne vaudrait rien (ADR 0004). **À confirmer** que cette conservation est
proportionnée.

## Ce qui est automatique, et n'a pas besoin de demande

La purge à trois mois (migration 0017) supprime les dossiers expirés, actes signés exceptés. La
plupart des demandes d'effacement arriveront après qu'elle soit passée : répondre alors que les
données ont déjà été détruites, en citant la date d'expiration.

## Tenir le compte

Un fichier `docs/rgpd/demandes.md`, hors dépôt public si le dépôt devient public, avec pour chaque
demande : date, nature, personne (référence de dossier, pas le nom), date de réponse, ce qui a été
fait. C'est ce qu'un contrôle demandera en premier.
