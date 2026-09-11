# Architecture

Cloison associe un site public et trois espaces applicatifs à un coffre documentaire chiffré. Next.js assure le rendu et les traitements serveur. PostgreSQL porte les décisions d'accès, les transitions métier et les files de travail ; Supabase fournit Auth et Storage.

## Acteurs et frontières d'accès

| Acteur                 | Accès                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Locataire              | Statut et avancement de son dossier, sans pièces ni montants du garant             |
| Garant                 | Dépôt et gestion de ses propres justificatifs au moyen d'une capacité limitée      |
| Collaborateur d'agence | Compte nominatif, MFA, rattachement et autorisations SQL avant consultation        |
| Serveur                | Opérations techniques explicitement autorisées, sans exposer ce rôle au navigateur |

Les porteurs utilisent des capacités signées, révocables et limitées à un dossier et à un rôle. L'agence utilise Supabase Auth ; `getUser()` vérifie la session et le niveau MFA est contrôlé avant les opérations protégées. Les politiques RLS et les permissions des fonctions PostgreSQL constituent la frontière de données. Le filtrage de l'interface ne vaut pas autorisation.

Voir les ADR [0002](adr/0002-modele-d-acces-et-creation-de-compte.md) et [0006](adr/0006-lien-magique-pour-le-locataire-et-le-garant.md).

## Cycle documentaire

Le serveur vérifie l'accès, le type et les limites du document avant son chiffrement par enveloppe. Storage conserve les octets chiffrés. La restitution agence passe par le serveur : contrôle de droits, trace nominative, déchiffrement, rasterisation et filigrane. Le garant dispose d'un parcours distinct pour son original.

Les lectures refusent les pièces expirées indépendamment de la maintenance. Les suppressions Storage sont reprises par une file durable. La conservation d'un acte signé ne prolonge pas celle des justificatifs. Les sauvegardes et caches ont leurs propres contraintes de rétention.

Le décodage est exécuté dans un processus interrompable avec limites de temps et de ressources applicatives ; il ne constitue pas une sandbox système complète. Voir les ADR [0003](adr/0003-stockage-et-chiffrement-des-pieces.md), [0004](adr/0004-filigranage-et-trace-de-consultation.md) et les [dettes techniques](dettes.md).

## Intégrations

- Resend transporte les courriels à partir de files et de mécanismes de reprise.
- Stripe assure le paiement locataire ; le registre et les outils de rapprochement suivent les événements et leurs anomalies.
- OpenRouter fournit une aide OCR facultative, avec accord explicite, quotas et résultat soumis à relecture. Il ne prend pas de décision de solvabilité.
- L'API des connecteurs expose des statuts limités avec des clés d'agence révocables ; elle n'expose pas les justificatifs.
- La chaîne Universign nécessite encore l'intégration et la validation du parcours contractuel complet avant ouverture.

Les fonctions métier utilisent révisions, préconditions et idempotence selon leur contrat. Une erreur de transport ne prouve pas qu'une écriture n'a pas abouti. Les [guides d'exploitation](README.md) décrivent les reprises et les limites de chaque intégration.

## Rendu et sécurité HTTP

Les pages publiques sont principalement prérendues. Les espaces applicatifs reçoivent du proxy Next une CSP avec nonce par requête. Les réponses sensibles utilisent des règles de cache privées ; les secrets restent côté serveur. Les échanges HTTP du client agence et du renouvellement de session sont bornés, sans remplacer les contrôles d'identité.

Les composants serveur sont privilégiés ; les formulaires et interactions utilisent les composants client nécessaires. Le contenu est regroupé dans `lib/content/`, et les composants partagent les tokens de `app/globals.css`.

## Validation et exploitation

Les tests couvrent les règles métier et les refus SQL avec PGlite. La CI ajoute PostgreSQL et PostgREST natifs, concurrence, restauration et parcours sur Chromium, Firefox et WebKit. Le build vérifie les dépendances documentaires réellement embarquées. Un scan de l'historique Git complète les contrôles de variables publiques.

La maintenance traite les échéances et les files ; la supervision contrôle notamment leur état et la dérive du schéma. Les validations automatisées sont distinctes de la réception humaine des alertes, des essais fournisseur et d'une restauration complète de production.
