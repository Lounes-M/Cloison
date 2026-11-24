/** Textes du connecteur Apimo (migration 0096). Vouvoiement. */
export const apimo = {
  titre: 'Apimo',
  etiquette: 'Votre logiciel',
  aide: 'Ouvrez un dossier de garantie depuis un bien à louer de votre Apimo, sans ressaisir le bien. Cloison lit vos biens à louer au moment où vous les demandez et n’en garde aucune copie.',
  cles: 'Demandez au support d’Apimo l’identifiant de prestataire, le jeton et l’identifiant d’agence de votre accès à l’API. Le jeton est chiffré avant d’être enregistré et n’est plus jamais affiché.',
  etat: {
    absent: 'Non connecté',
    actif: 'Connecté',
    erreur: 'Connecté, dernière lecture en échec',
  },
  verifieLe: (date: string) => `Dernière lecture réussie le ${date}`,
  jamaisVerifie: 'Aucune lecture réussie pour l’instant',
  identifiants: (fournisseur: string, agence: string) =>
    `Prestataire ${fournisseur}, agence ${agence}`,
  fournisseur: 'Identifiant de prestataire',
  agence: 'Identifiant d’agence Apimo',
  jeton: 'Jeton de l’API',
  jetonAide: 'Ressaisissez-le pour remplacer les identifiants enregistrés.',
  retour: 'Inscrire l’état du dossier sur la fiche du bien dans Apimo',
  retourAide:
    'Seuls la référence du dossier et son état simplifié sont envoyés : à compléter, prêt, en cours, signé ou clos. Aucun nom, aucun montant, aucune pièce.',
  retourFerme:
    'Le retour de l’état vers Apimo n’est pas encore ouvert. Votre choix sera appliqué dès son ouverture.',
  confirmation: 'Je confirme cette opération sur la connexion de mon agence.',
  enregistrer: 'Vérifier et enregistrer',
  reglerRetour: 'Enregistrer ce choix',
  retirer: 'Retirer la connexion',
  retirerAide:
    'Cloison n’appellera plus Apimo. Les dossiers déjà ouverts restent, sans retour d’état.',
  attente: 'Vérification…',
  succes: {
    configure: 'Identifiants vérifiés et enregistrés.',
    retour: 'Choix enregistré.',
    retire: 'Connexion retirée.',
  },
  echecs: {
    session: 'Session expirée, ou droits insuffisants.',
    saisie: 'Vérifiez les trois champs : deux identifiants en chiffres et le jeton, sans espace.',
    refus:
      'Apimo a refusé ces identifiants pour cette agence. Vérifiez-les, ou demandez au support d’Apimo si l’accès est activé.',
    limite: 'Trop de demandes en peu de temps. Réessayez dans quelques minutes.',
    indisponible: 'Apimo ne répond pas. Réessayez dans un instant.',
    reponse: 'La réponse d’Apimo ne se lit pas. Prévenez le support de Cloison.',
    secret: 'Le jeton enregistré ne se lit plus. Ressaisissez vos identifiants.',
    general: 'Opération impossible. Réessayez dans un instant.',
  },
  ouverture: {
    titre: 'Ouvrir un dossier depuis Apimo',
    lien: 'Ouvrir depuis Apimo',
    aide: 'Choisissez le bien, indiquez l’adresse du candidat locataire : il reçoit son lien, et le dossier est rattaché au bien.',
    retourEspace: 'Retour aux dossiers',
    nonConnecte:
      'Votre agence n’a pas encore connecté Apimo. Un administrateur peut le faire dans les réglages, rubrique Connexions aux logiciels.',
    reglages: 'Ouvrir les réglages de connexion',
    aucun: 'Apimo ne rend aucun bien à louer en cours pour votre agence.',
    tronque:
      'Votre parc dépasse 500 fiches : cette liste est partielle. Si le bien manque, ouvrez le dossier depuis votre espace.',
    biens: 'Bien à louer',
    sansLoyer: 'loyer non renseigné',
    surface: (m2: string) => `${m2} m²`,
    pieces: (n: number) => (n > 1 ? `${n} pièces` : '1 pièce'),
    reference: (r: string) => `Réf. ${r}`,
    courriel: 'Adresse e-mail du locataire',
    bail: 'Numéro du bail dans Apimo (facultatif)',
    bailAide: 'Lettres, chiffres, points, tirets et barres obliques, 40 caractères au plus.',
    loyer: 'Loyer mensuel, charges comprises (facultatif)',
    loyerAide:
      'Laissez vide pour reprendre le prix de la fiche Apimo. Vérifiez qu’il comprend les charges.',
    bouton: 'Ouvrir le dossier',
    envoi: 'Ouverture…',
    succes: (email: string) => `Dossier ouvert. L’envoi du lien à ${email} est programmé.`,
    incomplet:
      'Le dossier est ouvert, mais son rattachement à Apimo n’a pas été enregistré. Il se suit depuis votre espace.',
    erreurs: {
      bien: 'Choisissez un bien dans la liste.',
      bienAbsent: 'Ce bien n’est plus dans vos biens à louer chez Apimo. Rechargez la page.',
      bail: 'Ce numéro de bail ne se lit pas.',
      nonVerifiee:
        'Votre agence n’est pas encore vérifiée : l’ouverture d’un dossier pour un vrai locataire attend la vérification.',
    },
  },
  dossier: {
    titre: 'Apimo',
    bien: (id: string) => `Ouvert depuis le bien ${id}`,
    bail: (b: string) => `Bail ${b}`,
    envoye: (etat: string, date: string) => `État inscrit dans Apimo le ${date} : ${etat}`,
    pasEnvoye: 'Aucun état inscrit dans Apimo pour l’instant.',
    etats: {
      a_completer: 'à compléter',
      pret: 'prêt',
      en_cours: 'en cours',
      signe: 'signé',
      clos: 'clos',
    },
  },
}
