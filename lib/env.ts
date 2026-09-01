import 'server-only'

/**
 * Acces aux variables d'environnement serveur.
 *
 * Aucune de ces valeurs ne doit atteindre le navigateur : ce module importe
 * `server-only`, ce qui fait echouer la compilation si un composant client
 * l'importe, par accident ou par refactorisation malheureuse. C'est le pendant
 * a l'execution du garde-fou statique de `scripts/verifie-variables-publiques.mjs`.
 *
 * On lit paresseusement plutot qu'au chargement du module : le build doit
 * pouvoir se faire sans ces variables — la page /agences est statique, seule
 * la soumission du formulaire en a besoin.
 */

function requise(nom: string): string {
  const valeur = process.env[nom]?.trim()

  if (!valeur) {
    throw new Error(
      `Variable d'environnement manquante : ${nom}. ` +
        `Voir .env.example pour la liste attendue, et les variables du projet Vercel en production.`,
    )
  }

  return valeur
}

function optionnelle(nom: string, defaut: string): string {
  return process.env[nom]?.trim() || defaut
}

export const env = {
  /** URL du projet Supabase, region UE. */
  get supabaseUrl() {
    return requise('SUPABASE_URL')
  },

  /**
   * Cle anonyme Supabase. Volontairement la seule : la table n'autorise que
   * l'insertion, jamais la lecture. La cle de service, qui contourne RLS,
   * n'existe pas dans ce projet.
   */
  get supabaseAnonKey() {
    return requise('SUPABASE_ANON_KEY')
  },

  /** Cle Resend, pour la notification d'une nouvelle demande. */
  get resendApiKey() {
    return requise('RESEND_API_KEY')
  },

  /** Expediteur de la notification. */
  get emailExpediteur() {
    return optionnelle('EMAIL_EXPEDITEUR', 'Cloison <onboarding@resend.dev>')
  },

  /** Destinataire de la notification : toi. */
  get emailDestinataire() {
    return requise('EMAIL_DESTINATAIRE')
  },
}
