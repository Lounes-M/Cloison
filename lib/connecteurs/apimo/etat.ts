import 'server-only'
import type { ContexteAgence } from '@/lib/agences/contexte'
import { apimoActif } from './configuration'

type Rattache = Extract<ContexteAgence, { etat: 'rattache' }>
export type ConnexionApimo = {
  fournisseur: string
  agenceApimo: string
  retour: boolean
  verifieLe: string | null
  echec: 'refus' | 'limite' | 'indisponible' | 'reponse' | 'secret' | null
}

/**
 * L'etat de la connexion, sans le jeton : la colonne scellee n'est lisible par
 * aucun role. Null quand le connecteur est ferme ou que l'agence n'a rien saisi.
 */
export async function connexionApimo(c: Rattache): Promise<ConnexionApimo | null> {
  if (!apimoActif()) return null
  const { data, error } = await c.supabase
    .from('connexions_apimo')
    .select('fournisseur,agence_apimo,retour_statut,verifie_le,echec')
    .eq('agence_id', c.agence.id)
    .maybeSingle()
  if (error) throw new Error('Connexion Apimo indisponible')
  if (!data) return null
  return {
    fournisseur: String(data.fournisseur),
    agenceApimo: String(data.agence_apimo),
    retour: data.retour_statut === true,
    verifieLe: data.verifie_le == null ? null : String(data.verifie_le),
    echec: (data.echec ?? null) as ConnexionApimo['echec'],
  }
}

export type LienApimo = {
  bien: string
  bail: string | null
  etatEnvoye: string | null
  envoyeLe: string | null
}

/** Le lien Apimo d'un dossier de l'agence, s'il en a un. */
export async function lienApimoDuDossier(c: Rattache, dossier: string): Promise<LienApimo | null> {
  if (!apimoActif()) return null
  const { data, error } = await c.supabase
    .from('liens_apimo')
    .select('bien_apimo,bail_apimo,etat_envoye,envoye_le')
    .eq('dossier_id', dossier)
    .maybeSingle()
  if (error || !data) return null
  return {
    bien: String(data.bien_apimo),
    bail: data.bail_apimo == null ? null : String(data.bail_apimo),
    etatEnvoye: data.etat_envoye == null ? null : String(data.etat_envoye),
    envoyeLe: data.envoye_le == null ? null : String(data.envoye_le),
  }
}
