/**
 * Les textes des pages juridiques.
 *
 * Ils decrivent ce que le produit fait reellement, tel que les migrations le
 * fixent : durees, destinataires, chiffrement. Une regle changee dans le code
 * doit changer ici dans la meme PR. Ils doivent etre relus par un conseil
 * avant le premier dossier reel ; ce qui depend de l'identite de l'editeur
 * vient de `lib/juridique/editeur.ts`, jamais d'une valeur ecrite ici.
 *
 * Les pages juridiques vouvoient tout le monde : elles s'adressent a la fois
 * au locataire, au garant et a l'agence.
 */

import { prixActe, prixLocataire } from './tarifs'

export const versionConditions = 'conditions-2026-11-23'

export const juridique = {
  aCompleter: 'À compléter',
  immatriculation: 'En cours d’immatriculation',
  miseAJour: 'Dernière mise à jour : 24 novembre 2026.',
  navigation: 'Informations légales',
  liens: {
    mentions: { label: 'Mentions légales', href: '/mentions-legales' },
    confidentialite: { label: 'Confidentialité', href: '/confidentialite' },
    conditions: { label: 'Conditions', href: '/conditions' },
  },
} as const

/**
 * L'identite de l'editeur, telle que le registre du commerce l'enregistre.
 *
 * Cloison est une marque exploitee par LM Services : c'est cette societe qui
 * edite le site et encaisse, et c'est elle que les pages juridiques nomment.
 * Ces valeurs sont ecrites ici, et traduites dans `en/juridique.ts`, plutot
 * que lues dans des variables : elles suivent ainsi la langue de la page. La
 * TVA n'y figure pas : elle depend du regime reel de la societe, et se declare
 * par `EDITEUR_TVA`.
 */
export const identiteEditeur = {
  denomination: 'LM Services',
  forme: 'SASU, société par actions simplifiée unipersonnelle',
  capital: '1 000 €',
  siren: '994 493 435',
  rcs: '994 493 435 R.C.S. Paris',
  adresse: '231 rue Saint-Honoré, 75001 Paris',
  courriel: 'contact@cloison.immo',
  directeurPublication: 'Le président de LM Services',
} as const

/** La mention fiscale du prix, selon que l'editeur facture la TVA ou non. */
export const mentionTva = {
  ttc: 'Prix toutes taxes comprises.',
  franchise: 'TVA non applicable, article 293 B du CGI.',
} as const

export const mentionsLegales = {
  titre: 'Mentions légales',
  description: 'Éditeur, directeur de la publication et hébergement du site Cloison.',
  editeur: 'Éditeur',
  libelles: {
    denomination: 'Dénomination',
    forme: 'Forme juridique',
    capital: 'Capital social',
    siren: 'SIREN',
    rcs: 'Immatriculation',
    tva: 'TVA intracommunautaire',
    adresse: 'Siège',
    telephone: 'Téléphone',
    courriel: 'Contact',
    directeurPublication: 'Directeur de la publication',
  },
  hebergement: 'Hébergement',
  hebergementTexte: [
    'Le site et ses fonctions serveur sont hébergés par Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis. L’application s’exécute dans la région de Francfort (Union européenne).',
    'La base de données, l’authentification et les pièces chiffrées sont hébergées par un prestataire distinct, dans l’Union européenne. Ses coordonnées sont communiquées sur demande à l’adresse de contact ci-dessus.',
  ],
  donnees: 'Données personnelles et cookies',
  donneesTexte:
    'Cloison traite des données personnelles en qualité de responsable de traitement. La page Confidentialité détaille les données concernées, leur durée de conservation, leurs destinataires et la manière d’exercer vos droits. Le site ne dépose que les cookies strictement nécessaires à son fonctionnement : aucun cookie publicitaire, aucune mesure d’audience.',
  autres: 'Propriété et signalement',
  propriete:
    'Le code, les textes, la marque et les éléments graphiques de Cloison sont protégés. Aucune licence n’est accordée par la consultation du site.',
  signalement:
    'Pour signaler un contenu ou une vulnérabilité, écrivez à l’adresse de contact ci-dessus. Les vulnérabilités peuvent aussi être signalées en privé depuis la page sécurité du dépôt public.',
} as const

type Section = { id: string; titre: string; paragraphes: readonly string[] }

export const confidentialite = {
  titre: 'Confidentialité',
  description:
    'Ce que Cloison fait des données du locataire, du garant et des agences, combien de temps et avec qui.',
  introduction:
    'Cloison sépare trois espaces : le locataire suit son dossier, le garant dépose ses pièces de son côté, l’agence consulte le dossier complet. Cette page dit quelles données chacun confie, pourquoi, pour combien de temps, et comment exercer vos droits.',
  responsable: (denomination: string) =>
    `Le responsable du traitement est ${denomination}, éditeur de Cloison. L’agence à qui un dossier est transmis décide seule de la suite donnée à la candidature : pour cette décision et ce qu’elle conserve dans ses propres outils, elle est responsable de son propre traitement.`,
  sections: [
    {
      id: 'donnees',
      titre: 'Les données traitées',
      paragraphes: [
        'Locataire : adresse e-mail, nom, montant du loyer, statut du dossier, et, si vous réglez le dossier, la trace du paiement transmise par Stripe. Cloison ne reçoit jamais votre numéro de carte.',
        'Garant : adresse e-mail, nom, prénom, adresse postale, revenu net mensuel déclaré, étendue de l’engagement, mention de cautionnement que vous saisissez vous-même, et les justificatifs que vous déposez (bulletins de paie, avis d’imposition, pièce d’identité, justificatif de domicile, contrat de travail).',
        'Pour préparer l’acte de cautionnement, l’agence indique aussi la civilité, la date et le lieu de naissance du garant, le nom du locataire, le nom et l’adresse du bailleur et l’adresse du logement. Ces informations ne figurent que dans l’acte.',
        'Agence : adresse e-mail professionnelle de chaque collaborateur, rôle dans l’agence, et pour la vérification de l’agence, son SIREN et son numéro de carte professionnelle.',
        'Pour tous : la langue choisie, français ou anglais, pour afficher votre espace et vous écrire dans cette langue.',
        'Pour tous : un journal des consultations (qui a ouvert quoi, et quand) et, contre les abus, des empreintes d’adresse IP et d’adresse e-mail calculées avec une clé secrète, sans l’adresse elle-même.',
        'Aucune donnée de santé, d’opinion ou biométrique n’est demandée. La pièce d’identité n’est ni lue automatiquement ni comparée à un visage.',
      ],
    },
    {
      id: 'finalites',
      titre: 'Pourquoi, et sur quelle base',
      paragraphes: [
        'Constituer un dossier de garantie locative à la demande du locataire et le transmettre à l’agence qu’il a choisie : mesures précontractuelles prises à sa demande. Pour le garant, qui dépose lui-même ses pièces : intérêt légitime de l’agence à vérifier la garantie qui lui est proposée.',
        'Fournir l’espace agence et facturer le service : exécution du contrat avec l’agence.',
        'Encaisser le paiement du locataire et tenir la comptabilité : exécution du contrat et obligations légales.',
        'Sécuriser le service, limiter les abus et garder la trace des consultations : intérêt légitime de Cloison et des personnes dont les pièces sont protégées.',
      ],
    },
    {
      id: 'destinataires',
      titre: 'Qui voit quoi',
      paragraphes: [
        'Le locataire ne voit jamais les pièces, le revenu ni le ratio du garant : la base de données le refuse, pas seulement l’écran.',
        'L’agence rattachée au dossier consulte les pièces sous forme d’images, filigranées au nom de la personne qui les ouvre. Chaque ouverture est inscrite au journal, que le garant peut lire. L’agence ne reçoit jamais le fichier d’origine.',
        'Les pièces sont chiffrées avant d’être stockées. La clé qui les protège est conservée chez un autre hébergeur que les pièces elles-mêmes.',
        'Les équipes de Cloison n’ouvrent une pièce que pour répondre à une demande d’exercice de vos droits ou à une obligation légale.',
      ],
    },
    {
      id: 'durees',
      titre: 'Combien de temps',
      paragraphes: [
        'Un dossier sans pièce est effacé 30 jours après son ouverture. Un dossier avec pièces est effacé trois mois après son ouverture : pièces, clés de chiffrement, engagements et journal des consultations disparaissent ensemble.',
        'Un lien d’accès vaut sept jours au plus, dans la limite de la durée du dossier, et le renvoyer révoque le précédent. Un brouillon d’engagement est conservé sept jours au plus.',
        'L’historique des changements d’accès dans une agence est conservé 90 jours. Les empreintes utilisées contre les abus ne durent que le temps de leur fenêtre, d’une heure au plus. Une demande de démonstration envoyée par une agence est effacée douze mois au plus après son envoi.',
        'Les écritures comptables liées à un paiement sont conservées dix ans, comme l’exige la loi.',
      ],
    },
    {
      id: 'prestataires',
      titre: 'Où, et avec quels prestataires',
      paragraphes: [
        'Vercel exécute l’application dans la région de Francfort. Supabase héberge la base de données et les pièces chiffrées dans l’Union européenne. Resend achemine les courriels. Stripe traite le paiement par carte du locataire.',
        'Ces prestataires agissent sur instruction de Cloison, dans le cadre d’accords de traitement. Lorsqu’un prestataire relève d’un pays hors de l’Union européenne, le transfert est encadré par les clauses contractuelles types de la Commission européenne ou par le cadre de protection des données entre l’Union européenne et les États-Unis.',
      ],
    },
    {
      id: 'cookies',
      titre: 'Cookies et courriels',
      paragraphes: [
        'Cloison ne dépose aucun cookie publicitaire, aucun cookie de mesure d’audience et aucun traceur tiers. Les seuls cookies utilisés sont strictement nécessaires au service : celui qui porte votre lien d’accès au dossier, celui qui maintient la session d’un collaborateur d’agence, et celui qui retient la langue choisie. Ils sont exemptés de consentement, ce qui explique l’absence de bandeau.',
        'Le cookie d’accès au dossier dure sept jours au plus, celui de la langue un an. Vous pouvez les supprimer depuis votre navigateur : il faudra alors rouvrir votre lien ou vous reconnecter.',
        'Les courriels envoyés par Cloison ne contiennent ni image distante ni pixel de suivi : leur ouverture n’est signalée à personne. Cloison ne demande jamais de pièce ni de mot de passe par courriel.',
      ],
    },
  ] satisfies readonly Section[],
  sauvegardes: (jours: number) =>
    `Les sauvegardes techniques sont conservées ${jours} jours au plus, puis écrasées : une donnée effacée disparaît aussi des sauvegardes au plus tard ${jours} jours après son effacement. Elles servent uniquement à rétablir le service après un incident, jamais à consulter un dossier effacé.`,
  facultatifs: {
    signature: {
      docage:
        'La signature électronique de l’acte de cautionnement est confiée à Docage, prestataire français de signature électronique, qui reçoit aussi le numéro de téléphone du garant, nécessaire à la signature. L’acte signé est conservé selon la durée indiquée au moment de la signature, distincte de celle des justificatifs.',
      youtrust:
        'La signature électronique de l’acte de cautionnement est confiée à Youtrust, prestataire de signature électronique hébergé en France, qui reçoit aussi le numéro de téléphone du garant, nécessaire à la signature. L’acte signé est conservé selon la durée indiquée au moment de la signature, distincte de celle des justificatifs.',
    },
    ocr: 'À la demande explicite d’une agence, une pièce autre que la pièce d’identité peut être lue par un service de reconnaissance de texte (OpenRouter) pour faciliter sa relecture. Cette lecture ne prend aucune décision et n’est jamais déclenchée automatiquement.',
    // Le moteur documentaire distant : nomme si l'hebergeur est declare.
    moteurDocumentaire: (hebergeur: string | null) =>
      `À leur dépôt, puis à chaque consultation, les pièces sont vérifiées et converties en images sur un serveur dédié à ce seul traitement, ${hebergeur ? `hébergé par ${hebergeur}` : 'chez un hébergeur distinct de ceux cités plus haut'}. Elles y passent en clair le temps du traitement et n’y sont pas conservées.`,
    lectureGarant:
      'À votre demande explicite, une IA accessible par OpenRouter peut lire vos bulletins de paie et votre attestation de pension pour vous proposer un revenu net mensuel. Seuls le mois et le montant net payé sont extraits, sans conservation par le fournisseur. La proposition n’est enregistrée que si vous la reportez et l’enregistrez vous-même. La pièce d’identité n’est jamais envoyée.',
  },
  openRouter: {
    inactif:
      'Aucune pièce n’est envoyée à OpenRouter, Inc., société américaine, tant que la lecture automatique est désactivée. Cet envoi, lorsqu’il existe, n’est pas un hébergement en Europe.',
    actifEurope:
      'Lorsqu’une lecture est demandée, une copie de la pièce concernée est envoyée à OpenRouter, Inc., société américaine : ce n’est pas un hébergement européen. Le serveur de lecture est imposé en Europe, sans repli. La pièce d’identité n’est pas envoyée pour la lecture du revenu.',
    actifHorsEurope:
      'Lorsqu’une lecture est demandée, une copie de la pièce concernée est envoyée à OpenRouter, Inc., société américaine : ce n’est pas un hébergement européen, et le serveur de lecture n’est pas limité à l’Union européenne. Le transfert est encadré par les clauses contractuelles types. La pièce d’identité n’est pas envoyée pour la lecture du revenu.',
  },
  droits: {
    titre: 'Vos droits',
    paragraphes: [
      'Vous pouvez demander l’accès à vos données, leur rectification, leur effacement, leur portabilité ou la limitation de leur traitement, et vous opposer à un traitement fondé sur l’intérêt légitime. Le garant peut récupérer ses propres pièces telles qu’il les a déposées.',
      'Une réponse vous est apportée dans un délai d’un mois, que la loi permet de prolonger de deux mois pour une demande complexe ; vous en êtes alors informé avant la fin du premier mois. Aucun justificatif d’identité n’est demandé par principe.',
    ],
    contact: (courriel: string) => `Pour toute demande : ${courriel}.`,
    cnil: 'Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL.',
    lienCnil: 'https://www.cnil.fr/fr/plaintes',
  },
} as const

export const conditions = {
  titre: 'Conditions',
  description:
    'Ce que Cloison fournit au locataire, au garant et à l’agence, et ce que chacun s’engage à faire.',
  introduction:
    'Cloison prépare un dossier de garantie locative dans trois espaces séparés. Il transmet un dossier : il ne décide pas de la candidature, et ne garantit ni un logement ni la solvabilité d’un garant. Le projet d’acte de cautionnement qu’il prépare pour l’agence reprend un modèle public et les données du dossier : l’agence le relit, le complète et en reste responsable.',
  sections: [
    {
      id: 'locataire',
      titre: 'Le locataire',
      paragraphes: [
        'Vous obtenez un dossier valable trois mois à compter de son ouverture, dans lequel votre garant dépose ses pièces sans que vous les voyiez, et dont vous suivez l’avancement.',
        `Un dossier que vous ouvrez vous-même coûte ${prixLocataire}, une fois, payé par carte avant que le lien de votre garant parte. Un dossier ouvert par une agence ne vous coûte rien.`,
        'Vous fournissez une adresse e-mail à laquelle vous avez accès, désignez comme garant une personne qui a accepté de l’être et saisissez un loyer exact. Votre lien d’accès est personnel : ne le transmettez pas.',
      ],
    },
    {
      id: 'retractation',
      titre: 'Droit de rétractation du locataire',
      paragraphes: [
        'Vous disposez de quatorze jours à compter du paiement pour vous rétracter, sans avoir à vous justifier, en écrivant à l’adresse de contact indiquée dans les mentions légales.',
        'Au moment de payer, vous demandez expressément que le service commence tout de suite, pour que votre garant reçoive son lien sans attendre. Si vous vous rétractez ensuite dans les quatorze jours, vous êtes remboursé du prix, déduction faite de la part correspondant à la durée déjà écoulée sur les trois mois du dossier. Le remboursement intervient dans les quatorze jours, par le moyen de paiement utilisé.',
        'Passé ce délai, le prix reste acquis même si le dossier expire sans décision de l’agence : vous payez trois mois de coffre, pas un résultat.',
      ],
    },
    {
      id: 'garant',
      titre: 'Le garant',
      paragraphes: [
        'Vous ne payez rien, dans aucun cas.',
        'Vous déposez des pièces authentiques et qui vous concernent, déclarez un revenu exact et écrivez vous-même votre mention de cautionnement. Elle n’est jamais pré-remplie.',
        'L’acte de cautionnement que vous signerez éventuellement est un contrat entre vous et le bailleur, distinct de ces conditions. Il vous engage au-delà de la durée du dossier.',
      ],
    },
    {
      id: 'agence',
      titre: 'L’agence',
      paragraphes: [
        `Consulter un dossier est gratuit. Chaque acte signé et archivé coûte ${prixActe}. Les collaborateurs sont illimités. Un collaborateur rejoint l’espace de l’agence avec une adresse de son domaine, après accord d’un administrateur. L’ouverture de dossiers réels suit la vérification du SIREN et de la carte professionnelle de l’agence.`,
        'L’agence ne consulte que les dossiers qui lui sont transmis, dans le cadre d’une location réelle, et ne diffuse pas les pièces. Le ratio affiché est calculé sur un revenu déclaré : la vérification des pièces lui revient.',
        'Cloison peut suspendre l’accès d’une agence en cas de consultation anormale, de diffusion de pièces ou de déclaration inexacte.',
      ],
    },
    {
      id: 'responsabilite',
      titre: 'Disponibilité et responsabilité',
      paragraphes: [
        'Le service peut être interrompu pour maintenance. Cloison met en œuvre les mesures décrites dans la page Confidentialité pour protéger les pièces ; sa responsabilité ne couvre pas la décision prise par l’agence ni le contenu des pièces déposées.',
      ],
    },
    {
      id: 'litiges',
      titre: 'Litiges',
      paragraphes: [
        'Ces conditions sont soumises au droit français. En cas de difficulté, écrivez d’abord à l’adresse de contact : une réponse vous est apportée sous un mois.',
      ],
    },
  ] satisfies readonly Section[],
  mediateur: (nom: string) =>
    `Si vous êtes consommateur et que votre réclamation n’a pas abouti, vous pouvez recourir gratuitement au médiateur de la consommation : ${nom}.`,
  mediation:
    'Si vous êtes consommateur et que votre réclamation écrite n’a pas abouti dans un délai de deux mois, vous pouvez recourir gratuitement à un médiateur de la consommation, conformément à l’article L. 612-1 du code de la consommation. Ses coordonnées vous sont communiquées avec la réponse à votre réclamation, et à tout moment sur simple demande à l’adresse de contact.',
  tribunaux:
    'Vous pouvez aussi saisir les tribunaux compétents ; un consommateur peut saisir celui de son domicile.',
} as const
