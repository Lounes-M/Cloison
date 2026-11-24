import 'server-only'
import { z } from 'zod'
import type { ContexteAgence } from '@/lib/agences/contexte'
import { codeApimo, creerClientApimo, type ClientApimo, type CodeApimo } from './client'
import { apimoActif } from './configuration'
import { identifiantApimo, ouvrirIdentifiantsApimo } from './secret'

type Rattache = Extract<ContexteAgence, { etat: 'rattache' }>

const acces = z.strictObject({
  agence: z.uuid(),
  fournisseur: identifiantApimo,
  agence_apimo: identifiantApimo,
  jeton_scelle: z.string().min(60).max(1402),
})

export type AccesApimo =
  | { etat: 'ferme' }
  | { etat: 'absent' }
  | { etat: 'limite' }
  | { etat: 'secret' }
  | { etat: 'pret'; client: ClientApimo }

/**
 * Le client Apimo de l'agence connectee, ou la raison de son absence.
 *
 * La base decide : `acces_apimo` ne rend le scelle qu'a un membre de l'agence,
 * sous MFA, et compte chaque lecture. Rien ici ne vaut autorisation.
 */
export async function accesApimo(contexte: Rattache, budget?: AbortSignal): Promise<AccesApimo> {
  if (!apimoActif()) return { etat: 'ferme' }
  const { data, error } = await contexte.supabase.rpc('acces_apimo')
  if (error) throw new Error('Acces Apimo indisponible')
  if (data === null) return { etat: 'absent' }
  if (z.strictObject({ limite: z.literal(true) }).safeParse(data).success) return { etat: 'limite' }
  const lu = acces.safeParse(data)
  // La base ne rend que l'agence de la session : tout autre contenu est refuse.
  if (!lu.success || lu.data.agence !== contexte.agence.id) return { etat: 'secret' }
  try {
    const identifiants = ouvrirIdentifiantsApimo(lu.data.jeton_scelle, {
      agence: contexte.agence.id,
      fournisseur: lu.data.fournisseur,
      agenceApimo: lu.data.agence_apimo,
    })
    return { etat: 'pret', client: creerClientApimo(identifiants, { budget }) }
  } catch {
    // Cle maitresse changee ou scelle abime : l'agence doit ressaisir son jeton.
    await noterApimo(contexte, 'secret')
    return { etat: 'secret' }
  }
}

/** Le dernier resultat, pour l'ecran de l'administrateur. Jamais bloquant. */
export async function noterApimo(contexte: Rattache, resultat: 'ok' | CodeApimo | 'secret') {
  try {
    const code = resultat === 'incertain' ? 'indisponible' : resultat
    const { error } = await contexte.supabase.rpc('noter_apimo', { le_resultat: code })
    if (error) console.error('[apimo] resultat non note')
  } catch {
    console.error('[apimo] resultat non note')
  }
}

export type LectureBiens =
  | { etat: 'ferme' | 'absent' | 'limite' | 'secret' }
  | { etat: 'echec'; code: CodeApimo }
  | {
      etat: 'lu'
      biens: Awaited<ReturnType<ClientApimo['lireBiensALouer']>>['biens']
      tronque: boolean
    }

/** Les biens a louer de l'agence, lus a l'instant chez Apimo. Rien n'est garde. */
export async function lireBiensDeLAgence(contexte: Rattache): Promise<LectureBiens> {
  const budget = AbortSignal.timeout(20_000)
  const a = await accesApimo(contexte, budget)
  if (a.etat !== 'pret') return { etat: a.etat }
  try {
    const { biens, tronque } = await a.client.lireBiensALouer()
    await noterApimo(contexte, 'ok')
    return { etat: 'lu', biens, tronque }
  } catch (erreur) {
    const code = codeApimo(erreur)
    console.error('[apimo] lecture des biens impossible')
    await noterApimo(contexte, code)
    return { etat: 'echec', code }
  }
}
