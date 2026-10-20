import { expect, test } from 'vitest'
// @ts-expect-error Programme Node autonome.
import { verifierConfigurationActes } from '../scripts/verifier-configuration-actes.mjs'

const SECRET_YOUTRUST = 'secret-youtrust-fictif'
const recette = (): Record<string, string | undefined> => ({
  VERCEL_ENV: 'preview',
  YOUTRUST_ENVIRONMENT: 'sandbox',
  YOUTRUST_API_KEY: 'cle-fictive',
  YOUTRUST_WEBHOOK_SECRET: SECRET_YOUTRUST,
  YOUTRUST_WEBHOOK_SUBSCRIPTION_ID: '0b7c1f3e-2d4a-4c5b-9e6f-7a8b9c0d1e2f',
  YOUTRUST_MUTATIONS_ENABLED: 'true',
  YOUTRUST_REGISTRY_ENABLED: 'true',
  SIGNATURE_PARCOURS_ENABLED: 'true',
  ACTE_MODELE_VERSION: 'modele-2026-10',
  ACTE_CONSERVATION_JOURS: '3650',
  CRON_SECRET: 'cron-fictif',
  STRIPE_SECRET_KEY: 'sk_test_fictif',
})
const production = () => ({
  ...recette(),
  VERCEL_ENV: 'production',
  YOUTRUST_ENVIRONMENT: 'production',
  FACTURATION_ACTES_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_live_fictif',
  STRIPE_WEBHOOK_SECRET: 'whsec_fictif',
})
const erreurs = (env: Record<string, string | undefined>, profil: string) =>
  verifierConfigurationActes(env, profil).erreurs as string[]

test('une recette sandbox complete et une production complete sont conformes', () => {
  expect(verifierConfigurationActes(recette(), 'recette')).toMatchObject({
    conforme: true,
    erreurs: [],
  })
  expect(erreurs(production(), 'production')).toEqual([])
})

test('tout drapeau ferme ne demande aucun secret', () => {
  expect(erreurs({ YOUTRUST_ENVIRONMENT: 'sandbox' }, 'recette')).toEqual([])
})

test('un profil inconnu est refuse', () => {
  expect(() => verifierConfigurationActes(recette(), 'staging')).toThrow()
})

test.each([
  ['YOUTRUST_ENVIRONMENT', 'production', 'YOUTRUST_ENVIRONMENT doit valoir sandbox'],
  ['VERCEL_ENV', 'production', 'Recette sandbox dans le deploiement de production'],
  ['YOUTRUST_API_KEY', '', 'YOUTRUST_API_KEY manquante'],
  ['YOUTRUST_WEBHOOK_SECRET', ' ', 'YOUTRUST_WEBHOOK_SECRET manquante'],
  ['YOUTRUST_WEBHOOK_SUBSCRIPTION_ID', 'abonnement', 'doit etre un UUID'],
  ['YOUTRUST_REGISTRY_ENABLED', 'false', 'YOUTRUST_REGISTRY_ENABLED requis'],
  ['YOUTRUST_MUTATIONS_ENABLED', undefined, 'YOUTRUST_MUTATIONS_ENABLED requis'],
  ['SIGNATURE_PARCOURS_ENABLED', 'True', 'SIGNATURE_PARCOURS_ENABLED doit valoir true ou false'],
  ['ACTE_MODELE_VERSION', '  ', 'ACTE_MODELE_VERSION'],
  ['ACTE_MODELE_VERSION', 'x'.repeat(121), 'ACTE_MODELE_VERSION'],
  ['ACTE_CONSERVATION_JOURS', undefined, 'ACTE_CONSERVATION_JOURS'],
  ['ACTE_CONSERVATION_JOURS', '6', 'ACTE_CONSERVATION_JOURS'],
  ['ACTE_CONSERVATION_JOURS', '18251', 'ACTE_CONSERVATION_JOURS'],
  ['ACTE_CONSERVATION_JOURS', '30.5', 'ACTE_CONSERVATION_JOURS'],
  ['CRON_SECRET', undefined, 'CRON_SECRET manquante'],
  ['FACTURATION_ACTES_ENABLED', 'true', 'FACTURATION_ACTES_ENABLED interdit en recette'],
  ['STRIPE_SECRET_KEY', 'sk_live_fictif', 'Cle Stripe de production en recette'],
  ['STRIPE_SECRET_KEY', 'rk_live_fictif', 'Cle Stripe de production en recette'],
])('la recette refuse %s = %j', (nom, valeur, message) => {
  const env = { ...recette(), [nom]: valeur }
  const liste = erreurs(env, 'recette')
  expect(liste.some((e) => e.includes(message))).toBe(true)
})

test.each([
  ['YOUTRUST_ENVIRONMENT', 'sandbox', 'YOUTRUST_ENVIRONMENT doit valoir production'],
  ['VERCEL_ENV', 'preview', 'hors deploiement de production'],
  ['SIGNATURE_PARCOURS_ENABLED', 'false', 'SIGNATURE_PARCOURS_ENABLED requis par la facturation'],
  ['STRIPE_SECRET_KEY', 'sk_test_fictif', 'STRIPE_SECRET_KEY doit etre une cle de production'],
  ['STRIPE_WEBHOOK_SECRET', undefined, 'STRIPE_WEBHOOK_SECRET manquante'],
])('la production refuse %s = %j', (nom, valeur, message) => {
  const env = { ...production(), [nom]: valeur }
  expect(erreurs(env, 'production').some((e) => e.includes(message))).toBe(true)
})

test('le bilan ne contient aucune valeur de variable', () => {
  const env = { ...recette(), YOUTRUST_WEBHOOK_SUBSCRIPTION_ID: SECRET_YOUTRUST }
  const texte = JSON.stringify(verifierConfigurationActes(env, 'production'))
  for (const valeur of Object.values(env))
    if (valeur && valeur.length > 5) expect(texte).not.toContain(valeur)
})
