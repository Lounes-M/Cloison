import 'server-only'
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ouvrirMaitresse } from '@/lib/coffre/rotation-maitresse'

import { env } from '@/lib/env'

/**
 * Un bail rend dix messages. Le passage de maintenance en enchaine plusieurs
 * tant que le lot revient plein et sans echec : une file de rappels ne se vide
 * plus a dix messages par quart d'heure. Le premier echec arrete la serie, pour
 * ne pas insister sur un fournisseur qui refuse ou qui limite le debit.
 */
const TAILLE_DU_LOT = 10
const LOTS_PAR_PASSAGE = 6
/** Ecart minimal entre deux envois d'un meme passage : le debit du fournisseur. */
const ECART_ENTRE_ENVOIS_MS = 500
/** Passe ce delai, le passage ne prend plus de lot : le budget de la route est de 18 s. */
const DERNIER_LOT_AVANT_MS = 10_000

function attendre(duree: number, signal?: AbortSignal) {
  return new Promise<void>((resoudre) => {
    if (duree <= 0 || signal?.aborted) return resoudre()
    const fin = () => {
      clearTimeout(minuterie)
      signal?.removeEventListener('abort', fin)
      resoudre()
    }
    const minuterie = setTimeout(fin, duree)
    signal?.addEventListener('abort', fin, { once: true })
  })
}

export async function distribuerCourriels(
  db: SupabaseClient,
  identifiant?: string,
  signal?: AbortSignal,
) {
  const { error: etat } = await db.rpc('etat_file_courriels')
  if (etat) throw new Error('Etat des courriels indisponible')
  let echecs = 0
  let traites = 0
  let dernierEnvoi = 0
  const debut = Date.now()
  for (let lot = 0; lot < (identifiant ? 1 : LOTS_PAR_PASSAGE); lot++) {
    const echecsAvant = echecs
    // Un lot suivant n'est pris que s'il reste de quoi le distribuer : un bail
    // pris puis abandonne retarderait ses messages de cinq minutes.
    if (lot > 0 && (signal?.aborted || Date.now() - debut > DERNIER_LOT_AVANT_MS)) break
    const { data, error } = await db.rpc('prendre_courriels', {
      identifiant: identifiant ?? null,
    })
    if (error) {
      if (lot === 0) throw new Error('File de courriels indisponible')
      echecs++
      break
    }
    const messages = Array.isArray(data) ? data : []
    for (const message of messages) {
      signal?.throwIfAborted()
      if (dernierEnvoi) {
        await attendre(dernierEnvoi + ECART_ENTRE_ENVOIS_MS - Date.now(), signal)
        signal?.throwIfAborted()
      }
      dernierEnvoi = Date.now()
      const issue = await distribuerUn(db, message, signal)
      if (issue === 'envoye') traites++
      else if (issue === 'echec') echecs++
    }
    if (messages.length < TAILLE_DU_LOT || echecs > echecsAvant) break
  }
  // prendre_courriels peut avoir decouvert une issue ancienne pendant ce passage.
  const { data: reconciliation, error: bilan } = await db.rpc('etat_file_courriels')
  if (bilan) throw new Error('Etat des courriels indisponible')
  return { traites, echecs: echecs + Number(reconciliation ?? 0) }
}

type MessageEnFile = { id: string; contenu: string; bail: string; rappel_id?: string | null }

async function distribuerUn(
  db: SupabaseClient,
  message: MessageEnFile,
  signal?: AbortSignal,
): Promise<'envoye' | 'echec' | 'annule'> {
  if (message.rappel_id) {
    const { data: etatRappel, error: erreurRappel } = await db.rpc('confirmer_rappel_avant_envoi', {
      identifiant: message.id,
      le_bail: message.bail,
    })
    if (erreurRappel || etatRappel !== 'pret') {
      return erreurRappel || etatRappel !== 'annule' ? 'echec' : 'annule'
    }
  }
  let reussi = false
  let referenceFournisseur: string | null = null
  try {
    const contenu = JSON.parse(
      ouvrirMaitresse(Buffer.from(message.contenu, 'base64')).toString('utf8'),
    )
    // Dix messages maximum par bail : 30 secondes de transport au plus.
    // Le signal traverse le SDK jusqu'a fetch, sans simple course de promesses.
    const options = {
      idempotencyKey: `courriel/${message.id}`,
      signal: AbortSignal.any([AbortSignal.timeout(3_000), ...(signal ? [signal] : [])]),
    }
    const resultat = await new Resend(env.resendApiKey).emails.send(
      { ...contenu, tags: [{ name: 'cloison_id', value: message.id }] },
      options,
    )
    reussi =
      !resultat.error &&
      typeof resultat.data?.id === 'string' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(resultat.data.id)
    if (reussi) referenceFournisseur = resultat.data!.id
  } catch {
    // Ni contenu, ni adresse, ni lien dans les journaux.
    reussi = false
  }
  const { data: confirme, error: acquittement } = await db.rpc('acquitter_courriel', {
    identifiant: message.id,
    le_bail: message.bail,
    reference_fournisseur: referenceFournisseur,
  })
  return !reussi || acquittement || confirme !== true ? 'echec' : 'envoye'
}
