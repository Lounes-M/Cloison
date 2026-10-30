/**
 * Les questions frequentes du site public.
 *
 * Chaque reponse redit ce que les pages juridiques et le code fixent deja :
 * durees, prix, destinataires. Une regle changee ailleurs doit changer ici
 * dans la meme PR. Le locataire est tutoye ; le garant et l'agence vouvoyes.
 */

import { prixActe, prixLocataire } from './tarifs'

export const questions = {
  titre: 'Questions fréquentes',
  description:
    'Prix, confidentialité des pièces, durée de conservation, liens d’accès : les réponses aux questions du locataire, du garant et de l’agence.',
  introduction:
    'Les réponses courtes aux questions qu’on nous pose le plus. Le détail fait foi dans les conditions et la politique de confidentialité.',
  sommaire: 'Aller aux questions',
  groupes: [
    {
      id: 'locataire',
      titre: 'Je cherche un logement',
      questions: [
        {
          question: 'Combien ça coûte ?',
          reponse: `${prixLocataire}, une fois, pour un dossier valable trois mois. Tu peux te rétracter pendant quatorze jours : tu es alors remboursé, moins la part des trois mois déjà écoulée.`,
        },
        {
          question: 'Est-ce que je vois les pièces de mon garant ?',
          reponse:
            'Non. Tu suis l’avancement du dossier, jamais les pièces ni les montants. C’est la base de données qui l’interdit, pas seulement l’écran.',
        },
        {
          question: 'Mon garant n’a pas reçu son lien, ou il a expiré.',
          reponse:
            'Un lien vaut sept jours au plus. Tu peux le renvoyer depuis ton espace : le nouveau lien remplace le précédent, qui ne fonctionne plus.',
        },
        {
          question: 'Je peux avoir deux garants ?',
          reponse:
            'Oui. Tu peux désigner un second garant depuis ton espace. Chacun dépose ses pièces de son côté, sans voir celles de l’autre, et l’agence juge les deux ensemble.',
        },
        {
          question: 'J’ai perdu le lien de mon dossier.',
          reponse:
            'Passe par « Retrouver mon dossier » avec ton adresse et la référence reçue par e-mail : si le dossier est encore actif, un nouveau lien t’est envoyé.',
        },
      ],
    },
    {
      id: 'garant',
      titre: 'Je me porte caution',
      questions: [
        {
          question: 'Est-ce que je paie quelque chose ?',
          reponse: 'Jamais. Le garant ne paie rien, à aucune étape.',
        },
        {
          question: 'Qui voit mes pièces ?',
          reponse:
            'L’agence seulement, sur des copies filigranées, et chaque consultation est enregistrée à son nom. Le locataire ne voit ni vos pièces ni vos montants.',
        },
        {
          question: 'Combien de temps sont-elles conservées ?',
          reponse:
            'Trois mois au plus après l’ouverture du dossier. Si l’agence clôt le dossier plus tôt, l’accès est coupé tout de suite et les données partent à la purge suivante.',
        },
        {
          question: 'Mon lien ne fonctionne plus.',
          reponse:
            'Un seul lien vaut à la fois, sept jours au plus. Passez par « Retrouver mon dossier » avec votre adresse et la référence reçue dans l’invitation : si le dossier est encore actif, un nouveau lien vous est envoyé. Le locataire peut aussi vous le renvoyer depuis son dossier.',
        },
        {
          question: 'Mes pièces sont-elles protégées ?',
          reponse:
            'Elles sont chiffrées avant d’être stockées, avec une clé propre au dossier. Vous retrouvez vos originaux à l’identique ; le filigrane ne concerne que les copies montrées à l’agence.',
        },
      ],
    },
    {
      id: 'agence',
      titre: 'Je suis une agence',
      questions: [
        {
          question: 'Combien ça coûte ?',
          reponse: `Consulter les dossiers est gratuit. ${prixActe} par acte signé et archivé, lorsque la signature sera disponible.`,
        },
        {
          question: 'Comment mes collaborateurs rejoignent-ils l’espace ?',
          reponse:
            'Avec une adresse du domaine de votre agence, puis l’accord d’un administrateur. La double authentification est obligatoire pour tout le monde.',
        },
        {
          question: 'Un collaborateur a perdu son téléphone.',
          reponse:
            'Un administrateur réinitialise sa double authentification depuis la page des collaborateurs. Il en enregistre une nouvelle à sa prochaine connexion.',
        },
        {
          question: 'Le candidat s’est retiré, ou le logement est loué.',
          reponse:
            'Vous pouvez clore le dossier avant son échéance : l’accès de chacun est coupé tout de suite et la clé de chiffrement des pièces est détruite.',
        },
      ],
    },
  ],
} as const
