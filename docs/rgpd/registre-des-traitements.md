# Registre des traitements

Tâche 36 de la feuille de route. Ce document est un **brouillon technique** : il dit ce que le
produit fait réellement des données, tel que le code et les migrations le fixent. Il doit être relu
et complété par un conseil compétent avant le premier dossier réel, et la feuille de route est
explicite là-dessus. Ce qui est écrit ici est vérifiable dans le dépôt ; ce qui relève d'une
qualification juridique est marqué **à confirmer**.

Responsable de traitement : Cloison, représenté par Lounes Moumou (**à confirmer** : forme
juridique, SIREN, adresse).

## Traitement 1 : constitution et transmission d'un dossier de garantie locative

**Finalité.** Permettre à un locataire de constituer un dossier de garantie, à son garant d'y
déposer ses justificatifs sans que le locataire les voie, et à une agence de décider et de faire
signer un acte de cautionnement.

**Base légale.** Exécution de mesures précontractuelles à la demande de la personne (locataire,
garant) et intérêt légitime de l'agence pour la vérification de solvabilité. **À confirmer** par un
conseil, notamment pour le garant qui n'est pas partie au bail.

**Personnes concernées.** Locataires, garants, collaborateurs d'agences.

**Catégories de données.**

| Personne      | Données                                                                                                                      | Où                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Locataire     | adresse e-mail, nom, loyer, statut du dossier                                                                                | `dossiers`                                                  |
| Garant        | adresse e-mail, nom, prénom, adresse postale, revenu net mensuel déclaré, ce qu'il couvre, mention manuscrite, ratio calculé | `dossiers`, `engagements`                                   |
| Garant        | justificatifs : bulletins de paie, avis d'imposition, pièce d'identité, justificatif de domicile, contrat de travail         | Storage, seau `pieces`, **chiffrés** avant envoi (ADR 0003) |
| Collaborateur | adresse e-mail professionnelle, rôle dans l'agence                                                                           | `auth.users`, `membres_agence`                              |
| Tous          | journal des accès : qui a consulté ou ouvert quoi, quand                                                                     | `journal_acces`, en écriture seule                          |
| Tous          | empreintes HMAC d'adresses IP et e-mail pour la limitation de débit, **sans l'adresse elle-même** (migration 0008)           | `debits`, fenêtres de 10 minutes à 1 heure                  |

Aucune donnée de santé, d'opinion, ni biométrique. La pièce d'identité est un justificatif comme
les autres : aucune extraction automatique, aucune reconnaissance.

**Destinataires.** L'agence rattachée au dossier, pour ses collaborateurs, et seulement sous forme
rasterisée et filigranée à leur nom (ADR 0004). Le locataire ne voit jamais les pièces ni les
montants : la base le garantit, pas seulement l'écran (`docs/architecture.md`, matrice de
visibilité). Le garant ne voit que son propre dossier.

**Durées de conservation.**

| Objet                         | Durée                                                                   | Mécanisme                                                                  |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Dossier sans pièce déposée    | 30 jours après ouverture                                                | `expire_le`, migration 0003                                                |
| Dossier avec pièces           | 3 mois après ouverture, aligné sur le référentiel CNIL gestion locative | déclencheur de la 0003, purge de la 0017                                   |
| Clé de chiffrement du dossier | détruite avec le dossier : effacement cryptographique                   | cascade, migration 0005                                                    |
| Journal des accès             | vit et meurt avec le dossier                                            | cascade, migration 0007                                                    |
| Acte de cautionnement signé   | **survit au bail** ; durée à fixer avec le conseil                      | exempté de la purge (0017) ; classe de rétention propre à créer (ADR 0005) |
| Compteurs de débit            | une fenêtre, purgés à l'appel suivant                                   | migration 0008                                                             |

**Mesures de sécurité.** Chiffrement des pièces par enveloppe, clé maîtresse chez Vercel et
chiffré chez Supabase, deux hébergeurs, deux rayons d'explosion (ADR 0003). Row Level Security
active sur toutes les tables, refus par défaut, trois rôles Postgres séparés (ADR 0002). Liens
d'accès à capacité, signés, révocables, sept jours (ADR 0006). Journal des accès en écriture seule,
sur lequel personne ne peut écrire au nom d'un autre. Rasterisation de toute pièce servie à l'agence,
ce qui détruit le contenu actif. Aucune clé de service Supabase dans le code.

## Traitement 2 : demandes de démonstration et d'activation des agences

**Finalité.** Recevoir et traiter les demandes de contact des agences (`demandes_agence`) et leurs
demandes d'activation (SIREN, carte professionnelle).

**Base légale.** Intérêt légitime (prospection B2B) et mesures précontractuelles.

**Données.** Nom de l'agence, ville, volume déclaré, adresse e-mail professionnelle, message libre,
SIREN, numéro de carte professionnelle.

**Durée.** **À fixer** : proposition de trois ans après le dernier contact pour les demandes non
suivies d'un compte, durée du compte pour les autres.

## Sous-traitants

| Sous-traitant                      | Rôle                                        | Localisation                                                                                                                         | DPA                             |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Supabase                           | base de données, stockage, authentification | région UE choisie à l'ADR 0001, **à vérifier dans le projet**                                                                        | **à signer**                    |
| Vercel                             | hébergement, fonctions, clé maîtresse       | fonctions en `fra1` (Francfort), fixé dans `vercel.json` le 5 septembre 2026 et tenu par un test ; **à vérifier sur un déploiement** | **à signer**                    |
| Resend                             | envoi des courriels                         | **à vérifier** : région de traitement et transferts                                                                                  | **à signer**                    |
| Universign (Cryptolog, Signaturit) | signature électronique                      | QTSP UE, centres en France (ADR 0005)                                                                                                | **à signer**, compte non ouvert |

Le point Vercel est réglé par le dépôt plutôt que par un clic : la clé maîtresse et le
déchiffrement s'exécutent dans les fonctions, donc là où elles tournent, et `vercel.json` fixe
`fra1`. `tests/webhook.test.ts` refuse toute région hors Union européenne. Reste à lire, sur une
réponse d'une route dynamique en production, un `x-vercel-id` qui commence par `fra1`.

## Ce que ce registre ne couvre pas encore

- L'analyse d'impact (AIPD). Le traitement de justificatifs de revenus et d'identité de tiers, à
  l'échelle, peut y obliger. **À qualifier** avec le conseil.
- Les mentions d'information à afficher aux locataires et garants au moment de la collecte : elles
  existent en partie dans les écrans (« tout ce que tu déposes est chiffré… ») et doivent être
  complétées d'une page dédiée. La consigne « pas de page juridique encore » a été levée par la
  phase 5 : c'est le moment.
