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

import { prixLocataire } from './tarifs'

export const versionConditions = 'conditions-2026-10-21'

export const juridique = {
  aCompleter: 'À compléter',
  avertissementIncomplet:
    'Certaines informations sur l’éditeur sont en cours de publication. Elles figureront ici avant l’ouverture du service au public.',
  miseAJour: 'Dernière mise à jour : 21 octobre 2026.',
  navigation: 'Informations légales',
  liens: {
    mentions: { label: 'Mentions légales', href: '/mentions-legales' },
    confidentialite: { label: 'Confidentialité', href: '/confidentialite' },
    conditions: { label: 'Conditions', href: '/conditions' },
  },
} as const

/** La mention fiscale du prix, selon que l'editeur facture la TVA ou non. */
export const mentionTva = {
  ttc: 'Prix toutes taxes comprises.',
  franchise: 'TVA non applicable, article 293 B du CGI.',
} as const

export const mentionsLegales = {
  titre: 'Mentions légales',
  description: 'Éditeur, directeur de la publication et hébergeurs du site Cloison.',
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
  hebergeurs: [
    {
      nom: 'Vercel Inc.',
      role: 'Application et fonctions serveur, exécutées dans la région de Francfort (Union européenne).',
      adresse: '440 N Barranca Ave #4133, Covina, CA 91723, États-Unis',
      site: 'https://vercel.com',
    },
    {
      nom: 'Supabase, Inc.',
      role: 'Base de données, authentification et stockage des pièces chiffrées, dans un projet situé dans l’Union européenne.',
      adresse: null,
      site: 'https://supabase.com',
    },
  ],
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
        'Agence : adresse e-mail professionnelle de chaque collaborateur, rôle dans l’agence, et pour la vérification de l’agence, son SIREN et son numéro de carte professionnelle.',
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
        'L’historique des changements d’accès dans une agence est conservé 90 jours. Les empreintes utilisées contre les abus ne durent que le temps de leur fenêtre, d’une heure au plus.',
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
  ] satisfies readonly Section[],
  sauvegardes: (jours: number) =>
    `Les sauvegardes techniques sont conservées ${jours} jours au plus, puis écrasées : une donnée effacée disparaît aussi des sauvegardes au plus tard ${jours} jours après son effacement. Elles servent uniquement à rétablir le service après un incident, jamais à consulter un dossier effacé.`,
  facultatifs: {
    signature:
      'La signature électronique de l’acte de cautionnement est confiée à Youtrust, prestataire de signature électronique hébergé en France. L’acte signé est conservé selon la durée indiquée au moment de la signature, distincte de celle des justificatifs.',
    ocr: 'À la demande explicite d’une agence, une pièce peut être lue par un service de reconnaissance de texte (OpenRouter) pour faciliter sa relecture. Cette lecture ne prend aucune décision et n’est jamais déclenchée automatiquement.',
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
    'Cloison prépare un dossier de garantie locative dans trois espaces séparés. Il transmet un dossier : il ne décide pas de la candidature, ne garantit ni un logement ni la solvabilité d’un garant, et ne rédige pas l’acte de cautionnement.',
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
        'Consulter un dossier est gratuit, et les collaborateurs sont illimités. Un collaborateur rejoint l’espace de l’agence avec une adresse de son domaine, après accord d’un administrateur. L’ouverture de dossiers réels suit la vérification du SIREN et de la carte professionnelle de l’agence.',
        'L’agence ne consulte que les dossiers qui lui sont transmis, dans le cadre d’une location réelle, et ne diffuse pas les pièces. Le ratio affiché est calculé sur un revenu déclaré : la vérification des pièces lui revient.',
        'Cloison peut suspendre l’accès d’une agence en cas de consultation anormale, de diffusion de pièces ou de déclaration inexacte.',
      ],
    },
    {
      id: 'responsabilite',
      titre: 'Disponibilité et responsabilité',
      paragraphes: [
        'Cloison est en phase de pilote. Le service peut être interrompu pour maintenance. Cloison met en œuvre les mesures décrites dans la page Confidentialité pour protéger les pièces ; sa responsabilité ne couvre pas la décision prise par l’agence ni le contenu des pièces déposées.',
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
  tribunaux:
    'Vous pouvez aussi saisir les tribunaux compétents ; un consommateur peut saisir celui de son domicile.',
} as const
