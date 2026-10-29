export const acte = {
  etiquette: 'Acte de cautionnement',
  titre: 'Modèle d’acte de cautionnement',
  lien: 'Acte de cautionnement',
  explication:
    'Cloison rédige l’acte d’après le modèle officiel de Service-Public.fr, en caution simple ou solidaire selon les conditions du garant. L’identité du garant, le plafond, la durée et sa mention personnelle viennent du dossier. Complétez ce qui relève du bail.',
  mention:
    'La mention de l’article 2297 du code civil n’est jamais rédigée par Cloison : l’acte reprend, sans la modifier, celle que le garant a saisie lui-même.',
  relecture:
    'Ce modèle doit être relu par votre conseil avant sa première utilisation réelle. Vérifiez chaque projet avant de le transmettre.',
  conditions: 'Conditions du garant',
  solidaire: 'Caution solidaire',
  simple: 'Caution simple',
  plafond: 'Plafond de l’engagement',
  duree: 'Durée',
  indeterminee: 'Indéterminée',
  jusquAu: 'Jusqu’au',
  sansMention:
    'Le garant n’a pas encore saisi sa mention personnelle : l’acte ne peut pas être rédigé.',
  sections: {
    caution: 'État civil du garant',
    bail: 'Le bail',
    loyer: 'Le loyer',
    acte: 'L’acte',
  },
  champs: {
    civilite: 'Civilité',
    madame: 'Madame',
    monsieur: 'Monsieur',
    naissanceLe: 'Date de naissance',
    naissanceLieu: 'Lieu de naissance (commune, et pays si hors de France)',
    locataire: 'Prénom et nom du locataire',
    bailleurNom: 'Bailleur (prénom et nom, ou dénomination)',
    bailleurAdresse: 'Adresse du bailleur',
    logement: 'Adresse du logement loué',
    loyer: 'Loyer hors charges, en euros',
    charges: 'Provision sur charges, en euros (facultatif)',
    periodicite: 'Payable par',
    mois: 'mois',
    trimestre: 'trimestre',
    an: 'an',
    revisionLe: 'Date de révision annuelle (le jour et le mois sont repris)',
    irlTrimestre: 'Trimestre de référence de l’IRL',
    irlAnnee: 'Année de référence de l’IRL',
    coCautions: 'Autres cautions du même bail (une par ligne, facultatif)',
    faitLieu: 'Fait à',
    faitLe: 'Le',
  },
  rappelLoyer: 'Loyer charges comprises déclaré par le locataire :',
  telecharger: 'Télécharger le projet PDF',
  attente: 'Rédaction en cours…',
  pret: 'Projet prêt. Relisez le PDF en entier avant de le transmettre.',
  limite: 'Limite de génération atteinte. Réessayez plus tard.',
  erreur: 'Rédaction impossible pour le moment. Réessayez.',
  soumettre: 'Soumettre ce projet au garant',
  signatureFermee:
    'La signature électronique n’est pas encore ouverte : le projet peut être téléchargé, relu et signé hors de Cloison.',
  accord:
    'J’ai relu ce projet : les parties, le bail, les conditions et la mention du garant sont exacts.',
  refus: {
    saisie: 'Un champ est manquant ou mal formé. Vérifiez les dates et les montants.',
    dossier: 'Ce dossier ne permet pas de rédiger l’acte : il doit être transmis et encore actif.',
    mention:
      'Le garant doit d’abord compléter son identité, son adresse et sa mention personnelle.',
    mention_absente: 'Le garant n’a pas encore saisi sa mention personnelle.',
    mention_incomplete:
      'La mention du garant est incomplète pour ces conditions. Il doit la saisir de nouveau.',
    mention_plafond:
      'Le montant de la mention du garant ne correspond pas au plafond de l’engagement. Il doit la saisir de nouveau.',
    dates: 'Vérifiez les dates : naissance, date de l’acte et fin de l’engagement.',
    caracteres:
      'Un texte contient un caractère que le PDF ne peut pas reproduire. Corrigez la saisie concernée.',
  } as Record<string, string>,
}
