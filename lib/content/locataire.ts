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
  aide: 'Ton lien y arrive dans la minute. Tu pourras désigner ton garant ensuite.',
  bouton: 'Ouvrir mon dossier',
  envoi: 'Ouverture…',
  succesTitre: 'Regarde tes e-mails.',
  succesTexte:
    'Ton dossier est ouvert et ton lien vient de partir. Il est valable sept jours, et une seule fois.',
} as const

export const espace = {
  titre: 'Ton dossier',
  reference: 'Référence',
  garantTitre: 'Ton garant',
  garantAucun:
    'Tu n’as pas encore désigné de garant. C’est lui qui dépose les pièces, de son côté.',
  garantDesigne: (email: string) => `Lien envoyé à ${email}. Il dépose ses pièces de son côté.`,
  garantChamp: 'Son adresse e-mail',
  garantAide:
    'Il reçoit un lien pour déposer ses pièces. Tu ne verras jamais ce qu’il dépose, seulement que le dossier avance.',
  garantBouton: 'Envoyer le lien à mon garant',
  garantRenvoyer: 'Renvoyer le lien',
  garantEnvoi: 'Envoi…',
  garantSucces: 'Lien envoyé. Ton garant a sept jours pour déposer.',
  expire: (date: string) => `Ce dossier expire le ${date}.`,
  loyerTitre: 'Le loyer',
  loyerAide:
    'Charges comprises, par mois. C’est ce qui sert à établir si ton garant convient : sans lui, le dossier reste en attente.',
  loyerChamp: 'Loyer mensuel, charges comprises',
  loyerBouton: 'Enregistrer',
  loyerEnvoi: 'Enregistrement…',
  loyerSucces: 'Loyer enregistré.',
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
      'Le dossier n’ira pas plus loin avec ce garant. Tu peux en désigner un autre ci-dessous.',
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
  texte:
    'Il a expiré, a déjà servi, ou a été remplacé par un plus récent. Un seul lien vaut à la fois.',
  locataire: 'Si tu es locataire, ouvre un nouveau dossier ou demande un nouveau lien.',
  garant: 'Si tu es garant, demande au locataire de te renvoyer le lien depuis son dossier.',
  bouton: 'Ouvrir un dossier',
} as const
