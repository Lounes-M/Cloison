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
 * pouvoir se faire sans ces variables : la page /agences est statique, seule
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
   * Cle publiable Supabase (`sb_publishable_...`).
   *
   * Volontairement la seule du projet : la table n'autorise que l'insertion,
   * jamais la lecture. La cle secrete, qui contourne RLS, n'existe pas ici.
   *
   * Cote base, une requete portant cette cle prend le role Postgres `anon`,
   * exactement comme l'ancienne cle du meme nom. Les politiques ecrites
   * `to anon` s'appliquent donc sans changement. L'ancienne cle fonctionne
   * encore si elle est collee ici, mais Supabase la deprecie fin 2026.
   */
  get supabasePublishableKey() {
    return requise('SUPABASE_PUBLISHABLE_KEY')
  },

  /**
   * Le secret JWT du projet Supabase.
   *
   * Il signe les jetons de capacite du garant et du locataire. Supabase lit
   * ensuite le claim `role` et fait prendre a la connexion le role Postgres
   * correspondant : c'est ce secret qui rend la frontiere de l'ADR 0002
   * opposable, et pas seulement declarative.
   *
   * Comme la cle maitresse, il ne porte jamais le prefixe `NEXT_PUBLIC_` et ne
   * passe jamais par le bloc `env` de `next.config.ts`.
   */
  get supabaseJwtSecret() {
    return requise('SUPABASE_JWT_SECRET')
  },

  /**
   * La cle secrete Stripe, et le secret de signature de son webhook.
   *
   * Lues paresseusement, comme le reste : tant que le paiement n'est pas
   * branche, rien ne les demande, et une page qui ne paie pas ne doit pas
   * echouer parce qu'elles manquent.
   */
  get stripeSecretKey() {
    return requise('STRIPE_SECRET_KEY')
  },

  get stripeWebhookSecret() {
    return requise('STRIPE_WEBHOOK_SECRET')
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

  /**
   * L'adresse de support, ou rien.
   *
   * Optionnelle sans valeur de repli : tant qu'elle n'est pas fixee, l'espace
   * agence n'affiche rien plutot qu'une adresse qui ne repondrait a personne,
   * et les courriels partent sans `replyTo`. Le jour ou elle est posee, tout
   * s'affiche et repond sans autre changement.
   */
  get emailSupport(): string | null {
    return process.env.EMAIL_SUPPORT?.trim() || null
  },
}
