# Gabarits des courriels d'authentification

Le courriel de connexion d'un collaborateur d'agence n'est pas envoyé par
l'application : c'est Supabase Auth qui l'écrit, à partir d'un gabarit réglé
dans le tableau de bord du projet. Il ne peut donc pas être déployé avec le
code. Ce dossier en garde la version de référence, aux couleurs des autres
courriels (`lib/courriels/gabarit.ts`).

## Installation

Dans Supabase : Authentication, Email Templates.

| Gabarit Supabase | Fichier                  | Objet                                                                                                      |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Magic Link       | `lien-de-connexion.html` | `{{ if eq .Data.langue "en" }}Your Cloison sign-in link{{ else }}Votre lien de connexion Cloison{{ end }}` |
| Confirm signup   | `lien-de-connexion.html` | le même                                                                                                    |

Le gabarit choisit sa langue d'après `.Data.langue`, que l'application pose
sur le compte : à la création (`lib/agences/connexion.ts`) puis à chaque
changement de langue (`lib/action-langue.ts`). Sans valeur, le français.

À vérifier après collage : le suivi des clics et des ouvertures doit rester
désactivé chez le fournisseur d'envoi, sinon le lien est réécrit et la
promesse de la page Confidentialité (aucun pixel de suivi) ne tient plus.
