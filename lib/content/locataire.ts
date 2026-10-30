/**
 * Ce que le locataire lit.
 *
 * La regle qui gouverne chaque phrase ici : il apprend ou en est son dossier,
 * jamais pourquoi. « Ce garant ne convient pas » ne dit ni le montant ni le
 * ratio, et c'est voulu depuis la migration 0003 : le detail vit dans une table
 * qu'il ne lit pas, et le texte ne doit pas le trahir par la bande.
 */

export const porte = {
  titre: 'Crée ton dossier',
  sousTitre:
    'Une adresse e-mail, et tu reçois un lien. Pas de compte, pas de mot de passe : le lien est ta clé.',
  champ: 'Ton adresse e-mail',
  aide: 'Tu recevras ton lien par e-mail. Vérifie aussi tes indésirables.',
  bouton: 'Ouvrir mon dossier',
  envoi: 'Ouverture…',
  succesTitre: 'Regarde tes e-mails.',
  succesTexte:
    'Si la demande a pu être traitée, tu recevras un lien valable sept jours. Garde-le pour retrouver ton dossier.',
} as const

/** Le second garant (0067), proposé seulement dans un dossier ouvert par une agence. */
export const secondGarant = {
  titre: 'Un second garant',
  aide: 'Si un seul garant ne suffit pas, tu peux en ajouter un deuxième. Ses revenus s’ajoutent à ceux du premier, et chacun dépose ses pièces de son côté, sans voir celles de l’autre.',
  designe: (email: string) => `Second garant désigné : ${email}. Il dépose ses pièces de son côté.`,
  champ: 'Son adresse e-mail',
  bouton: 'Envoyer le lien au second garant',
  renvoyer: 'Renvoyer son lien',
  envoi: 'Envoi…',
  succes: 'L’envoi du lien est programmé. Le dossier attend désormais les pièces des deux garants.',
  erreurs: {
    adresse: 'Cette adresse ne ressemble pas à une adresse e-mail.',
    doublon: 'Le second garant doit être une autre personne que toi et ton premier garant.',
    refus: 'Ce dossier ne peut pas recevoir de second garant pour l’instant.',
    debit: 'Trop de liens envoyés. Réessaie dans un quart d’heure.',
    expire: 'Ton lien a expiré. Demande-en un nouveau.',
  },
} as const

export const espace = {
  garantRenouvellement:
    'Tu peux renvoyer son accès au même garant. Le dossier reste figé et le nouveau lien remplace le précédent.',
  titre: 'Ton dossier',
  reference: 'Référence',
  garantTitre: 'Ton garant',
  garantAucun:
    'Tu n’as pas encore désigné de garant. C’est lui qui dépose les pièces, de son côté.',
  garantDesigne: (email: string) => `Garant désigné : ${email}. Il dépose ses pièces de son côté.`,
  garantChamp: 'Son adresse e-mail',
  garantAide:
    'Il reçoit un lien pour déposer ses pièces. Tu ne verras jamais ce qu’il dépose, seulement que le dossier avance.',
  garantBouton: 'Envoyer le lien à mon garant',
  garantRenvoyer: 'Renvoyer le lien',
  garantEnvoi: 'Envoi…',
  garantSucces: 'L’envoi du lien est programmé. Sa validité reste limitée à celle du dossier.',
  expire: (date: string) => `Ce dossier expire le ${date}.`,
  loyerTitre: 'Le loyer',
  loyerAide:
    'Charges comprises, par mois. C’est ce qui sert à établir si ton garant convient : sans lui, le dossier reste en attente. Le loyer est figé après la déclaration du garant.',
  loyerChamp: 'Loyer mensuel, charges comprises',
  loyerBouton: 'Enregistrer',
  loyerEnvoi: 'Enregistrement…',
  loyerSucces: 'Loyer enregistré.',
} as const

/** L'encart du haut : tes gestes a toi, jamais ce que depose ton garant. */
export const resteAFaire = {
  titre: 'Ce qu’il te reste à faire',
  aide: 'Chaque ligne mène à l’endroit de la page où le faire.',
  etapes: {
    loyer: 'Indique le loyer mensuel, charges comprises.',
    paiement: 'Règle le dossier pour que ton garant reçoive son lien.',
    garant: 'Désigne ton garant : il reçoit un lien pour déposer ses pièces.',
  },
  attente:
    'Rien à faire de ton côté pour l’instant. Ton garant dépose ses pièces ; tu verras le dossier avancer ici.',
} as const

/**
 * Les statuts, tels que le locataire les voit.
 *
 * `ton` pilote la couleur du bandeau. Aucun libelle ne contient de chiffre.
 */
export const statuts: Record<
  string,
  { libelle: string; explication: string; ton: 'sky' | 'sun' | 'mint' | 'flame' | 'paper' }
> = {
  ouvert: {
    libelle: 'Dossier ouvert',
    explication: 'En attente de ton garant. Désigne-le ci-dessous pour qu’il reçoive son lien.',
    ton: 'sky',
  },
  depot_en_cours: {
    libelle: 'Dépôt en cours',
    explication: 'Ton garant a commencé à déposer ses pièces. Rien à faire de ton côté.',
    ton: 'sun',
  },
  complet: {
    libelle: 'Dossier complet',
    explication: 'Toutes les pièces sont là. Ton garant est éligible : l’agence peut décider.',
    ton: 'mint',
  },
  garant_insuffisant: {
    libelle: 'Ce garant ne convient pas',
    explication:
      'Contacte ton agence pour la suite. Les données de ce garant restent dans son dossier.',
    ton: 'flame',
  },
  transmis: {
    libelle: 'Transmis à l’agence',
    explication: 'L’agence a reçu le dossier. Elle revient vers toi.',
    ton: 'mint',
  },
  signe: {
    libelle: 'Acte signé',
    explication: 'Ton garant a signé. Le dossier est terminé.',
    ton: 'mint',
  },
  refuse: {
    libelle: 'Dossier refusé',
    explication: 'L’agence n’a pas retenu ce dossier.',
    ton: 'flame',
  },
  expire: {
    libelle: 'Dossier expiré',
    explication: 'Ce dossier a atteint sa date limite. Tu peux en ouvrir un nouveau.',
    ton: 'paper',
  },
}

export const lienInvalide = {
  titre: 'Ce lien ne fonctionne plus',
  texte: 'Il a expiré, a été révoqué ou remplacé par un plus récent. Un seul lien vaut à la fois.',
  locataire: 'Si tu es locataire, ouvre un nouveau dossier ou demande un nouveau lien.',
  garant: 'Sans la référence, le locataire peut aussi vous renvoyer le lien depuis son dossier.',
  bouton: 'Ouvrir un dossier',
} as const
