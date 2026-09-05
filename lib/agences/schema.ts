import { z } from 'zod'

/**
 * Le contrat du formulaire agence, partage par le client et le serveur.
 *
 * Le navigateur s'en sert pour afficher les erreurs tout de suite ; le serveur
 * le revalide integralement, parce qu'une validation cote client n'est qu'un
 * confort d'interface : n'importe qui peut poster directement sur l'action.
 */

// Ce module est le seul de zod a partir dans un bundle client. Par defaut,
// zod sonde `new Function('')` au premier objet valide, pour compiler ses
// schemas ; sous la Content-Security-Policy du site, le navigateur refuse et
// le signale, meme si zod rattrape l'erreur. `jitless` supprime la sonde. Le
// cout est nul a l'echelle d'un formulaire.
z.config({ jitless: true })

export const VOLUMES = [
  { valeur: 'moins-de-10', libelle: 'Moins de 10' },
  { valeur: '10-50', libelle: 'Entre 10 et 50' },
  { valeur: '50-200', libelle: 'Entre 50 et 200' },
  { valeur: 'plus-de-200', libelle: 'Plus de 200' },
] as const

export const volumes = VOLUMES.map((v) => v.valeur)

/** Fournisseurs grand public : le champ demande une adresse professionnelle. */
const DOMAINES_GRAND_PUBLIC = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'outlook.fr',
  'live.fr',
  'free.fr',
  'orange.fr',
  'wanadoo.fr',
  'sfr.fr',
  'laposte.net',
  'icloud.com',
  'me.com',
])

export const schemaDemandeAgence = z.object({
  nomAgence: z
    .string()
    .trim()
    .min(2, "Le nom de l'agence est trop court.")
    .max(120, "Le nom de l'agence est trop long."),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, 'Adresse e-mail incomplète.')
    .max(180, 'Adresse e-mail trop longue.')
    .pipe(z.email("Cette adresse e-mail n'est pas valide."))
    .refine((valeur) => !DOMAINES_GRAND_PUBLIC.has(valeur.split('@')[1] ?? ''), {
      message: 'Utilise ton adresse professionnelle, pas une adresse personnelle.',
    }),

  ville: z.string().trim().min(2, 'Ville trop courte.').max(80, 'Ville trop longue.'),

  dossiersParAn: z.enum(volumes as [string, ...string[]], {
    message: 'Choisis un volume.',
  }),

  message: z
    .string()
    .trim()
    .max(2000, 'Message trop long (2000 caractères maximum).')
    .optional()
    .transform((valeur) => (valeur ? valeur : undefined)),

  /**
   * Piege a robots : un champ invisible que seul un remplissage automatique
   * touche.
   *
   * Volontairement sans contrainte de longueur. Le refuser ici produirait une
   * erreur de validation affichee, ce qui revelerait le piege et apprendrait
   * au script quel champ laisser vide. Le controle se fait dans l'action, qui
   * repond par un succes de facade.
   */
  siteWeb: z.string().optional(),

  /**
   * Horodatage d'affichage du formulaire, pose par le client. Un envoi
   * quasi instantane trahit un script plutot qu'une personne.
   */
  affichéÀ: z.coerce.number().int().positive().optional(),
})

export type DemandeAgence = z.infer<typeof schemaDemandeAgence>

/** En deca, personne n'a materiellement eu le temps de remplir le formulaire. */
export const DELAI_MINIMAL_MS = 2500
