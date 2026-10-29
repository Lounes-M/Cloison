import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DRAPEAUX = [
  'SIGNATURE_MUTATIONS_ENABLED',
  'SIGNATURE_REGISTRE_ENABLED',
  'SIGNATURE_PARCOURS_ENABLED',
  'FACTURATION_ACTES_ENABLED',
]
const present = (env, nom) => typeof env[nom] === 'string' && env[nom].trim() !== ''
const cleStripeReelle = (v) => typeof v === 'string' && /^(sk|rk)_live_/.test(v)

/**
 * Controle hors ligne la coherence des variables de la chaine des actes avant
 * d'ouvrir un drapeau. Aucun appel reseau ; seuls les noms de variables sont
 * rapportes, jamais leurs valeurs.
 */
export function verifierConfigurationActes(env, profil) {
  if (profil !== 'recette' && profil !== 'production') throw new Error('Profil inconnu')
  const erreurs = []
  const refuser = (message) => erreurs.push(message)
  const actif = Object.fromEntries(DRAPEAUX.map((n) => [n, env[n] === 'true']))

  // Le code ne reconnait que la valeur exacte true : toute autre valeur ferme
  // silencieusement le drapeau, ce qui masquerait une erreur de saisie.
  for (const nom of DRAPEAUX)
    if (env[nom] !== undefined && env[nom] !== '' && env[nom] !== 'true' && env[nom] !== 'false')
      refuser(`${nom} doit valoir true ou false`)

  const attendu = profil === 'recette' ? 'sandbox' : 'production'
  if (env.SIGNATURE_ENVIRONMENT !== attendu) refuser(`SIGNATURE_ENVIRONMENT doit valoir ${attendu}`)
  if (env.VERCEL_ENV !== undefined) {
    if (profil === 'production' && env.VERCEL_ENV !== 'production')
      refuser('Signature de production hors deploiement de production')
    if (profil === 'recette' && env.VERCEL_ENV === 'production')
      refuser('Recette sandbox dans le deploiement de production')
  }

  // Docage par defaut ; Youtrust reste disponible en secours.
  const prestataire = (env.SIGNATURE_PRESTATAIRE ?? '').trim() || 'docage'
  if (prestataire !== 'docage' && prestataire !== 'youtrust')
    refuser('SIGNATURE_PRESTATAIRE doit valoir docage ou youtrust')
  const signatureUtilisee =
    actif.SIGNATURE_MUTATIONS_ENABLED ||
    actif.SIGNATURE_REGISTRE_ENABLED ||
    actif.SIGNATURE_PARCOURS_ENABLED
  if (signatureUtilisee && prestataire === 'docage') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.DOCAGE_EMAIL ?? ''))
      refuser('DOCAGE_EMAIL doit etre une adresse')
    if (!present(env, 'DOCAGE_API_KEY')) refuser('DOCAGE_API_KEY manquante')
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.DOCAGE_WEBHOOK_TOKEN ?? ''))
      refuser('DOCAGE_WEBHOOK_TOKEN doit contenir 32 a 256 caracteres sans symbole')
  }
  if (signatureUtilisee && prestataire === 'youtrust') {
    for (const nom of ['YOUTRUST_API_KEY', 'YOUTRUST_WEBHOOK_SECRET'])
      if (!present(env, nom)) refuser(`${nom} manquante`)
    if (!UUID.test(env.YOUTRUST_WEBHOOK_SUBSCRIPTION_ID ?? ''))
      refuser('YOUTRUST_WEBHOOK_SUBSCRIPTION_ID doit etre un UUID')
  }

  if (actif.SIGNATURE_PARCOURS_ENABLED) {
    if (!actif.SIGNATURE_REGISTRE_ENABLED)
      refuser('SIGNATURE_REGISTRE_ENABLED requis par le parcours')
    if (!actif.SIGNATURE_MUTATIONS_ENABLED)
      refuser('SIGNATURE_MUTATIONS_ENABLED requis pour envoyer un acte')
    const modele = (env.ACTE_MODELE_VERSION ?? '').trim()
    if (modele.length < 1 || modele.length > 120)
      refuser('ACTE_MODELE_VERSION doit contenir 1 a 120 caracteres')
    const jours = env.ACTE_CONSERVATION_JOURS ?? ''
    if (!/^\d{1,5}$/.test(jours) || Number(jours) < 7 || Number(jours) > 18250)
      refuser('ACTE_CONSERVATION_JOURS doit etre un entier de 7 a 18250')
    if (!present(env, 'CRON_SECRET')) refuser('CRON_SECRET manquante pour le traitement des actes')
  }

  if (profil === 'recette') {
    // La sandbox ne cree jamais de creance ; une cle Stripe reelle n'a rien a y faire.
    if (actif.FACTURATION_ACTES_ENABLED) refuser('FACTURATION_ACTES_ENABLED interdit en recette')
    if (cleStripeReelle(env.STRIPE_SECRET_KEY)) refuser('Cle Stripe de production en recette')
  } else if (actif.FACTURATION_ACTES_ENABLED) {
    if (!actif.SIGNATURE_PARCOURS_ENABLED)
      refuser('SIGNATURE_PARCOURS_ENABLED requis par la facturation')
    if (!cleStripeReelle(env.STRIPE_SECRET_KEY))
      refuser('STRIPE_SECRET_KEY doit etre une cle de production')
    if (!present(env, 'STRIPE_WEBHOOK_SECRET')) refuser('STRIPE_WEBHOOK_SECRET manquante')
  }

  return {
    profil,
    prestataire,
    conforme: erreurs.length === 0,
    drapeaux: Object.fromEntries(DRAPEAUX.map((n) => [n, actif[n]])),
    erreurs,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const bilan = verifierConfigurationActes(process.env, process.argv[2])
    console.log(JSON.stringify(bilan, null, 2))
    if (!bilan.conforme) process.exitCode = 1
  } catch {
    console.error('Usage : node scripts/verifier-configuration-actes.mjs recette|production')
    process.exitCode = 2
  }
}
