import { createHash } from 'node:crypto'
import { clientServeur } from '@/lib/acces/serveur'
import { consommerDebit } from '@/lib/acces/debit'
import { lireCorpsWebhook } from '@/lib/http/corps-webhook'
import { identifiantsRemise, reponseRemise } from '@/lib/droits/remise-format'
import { verifierUrlRemise } from '@/lib/droits/remise-url'
import { fluxRemise } from '@/lib/droits/flux-remise'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const maxDuration = 60
const entetes = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
const refuser = () =>
  Response.json({ erreur: 'Remise indisponible.' }, { status: 403, headers: entetes })

export async function POST(requete: Request) {
  try {
    if (
      requete.headers.get('origin') !== new URL(requete.url).origin ||
      requete.headers.get('content-type') !== 'application/json' ||
      Number(requete.headers.get('content-length')) > 2048
    )
      return refuser()
    const signal = AbortSignal.any([requete.signal, AbortSignal.timeout(50000)])
    const db = await clientServeur(signal)
    const ip = requete.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnu'
    if (
      !(await consommerDebit(db, 'remise_ip', ip)) ||
      !(await consommerDebit(db, 'remise_global', 'global'))
    )
      return refuser()
    const brut = await lireCorpsWebhook(requete)
    if (!brut || Buffer.byteLength(brut) > 2048) return refuser()
    const entree = identifiantsRemise.parse(JSON.parse(brut))
    if (entree.confirmer && entree.telecharger) return refuser()
    const hash = (s: string) => createHash('sha256').update(s).digest('hex')
    const { data, error } = await db.rpc('autoriser_remise_droits', {
      le_id: entree.id,
      le_jeton: hash(entree.jeton),
      la_preuve: hash(entree.preuve),
      confirmer: entree.confirmer,
    })
    if (error) return refuser()
    const droit = reponseRemise.parse(data)
    if (
      droit.id !== entree.id ||
      droit.recu !== entree.confirmer ||
      Date.parse(droit.expireLe) !== Date.parse(droit.manifeste.expireLe) ||
      Date.parse(droit.expireLe) <= Date.now()
    )
      return refuser()
    if (entree.confirmer) return Response.json({ recu: true }, { headers: entetes })
    if (!entree.telecharger) return Response.json(droit, { headers: entetes })
    if (droit.secondes < 1) return refuser()
    const signe = await db.storage.from('exports-droits').createSignedUrl(entree.id, droit.secondes)
    if (signe.error || !signe.data?.signedUrl) return refuser()
    const url = verifierUrlRemise(signe.data.signedUrl, env.supabaseUrl, entree.id)
    const flux = await fluxRemise(url, droit.taille, droit.sha256, signal)
    return new Response(flux, {
      headers: {
        ...entetes,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename=paquet-chiffre',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    // Ni les identifiants de remise, ni les corps, ni les erreurs du fournisseur.
    return refuser()
  }
}
