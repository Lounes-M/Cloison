import 'server-only'
import { creerClientYoutrust } from './client-youtrust'
import { creerVerificateurYoutrust, environnementYoutrust } from './youtrust'

function configuration() {
  const environnement = environnementYoutrust.safeParse(process.env.YOUTRUST_ENVIRONMENT)
  if (!environnement.success) throw new Error('Configuration Youtrust indisponible')
  return environnement.data
}

/** Aucune origine configurable, aucun environnement de repli, aucune cle client. */
export function clientYoutrustConfigure(signal?: AbortSignal) {
  return creerClientYoutrust(
    {
      environnement: configuration(),
      cleApi: process.env.YOUTRUST_API_KEY ?? '',
      autoriserMutations: process.env.YOUTRUST_MUTATIONS_ENABLED === 'true',
    },
    fetch,
    signal,
  )
}

export function verificateurYoutrustConfigure() {
  return creerVerificateurYoutrust({
    environnement: configuration(),
    secret: process.env.YOUTRUST_WEBHOOK_SECRET ?? '',
    abonnement: process.env.YOUTRUST_WEBHOOK_SUBSCRIPTION_ID ?? '',
  })
}
