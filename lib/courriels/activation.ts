import 'server-only'

import { envoyer } from './envoi'

import { env } from '@/lib/env'

/**
 * Le courriel qui t'annonce une demande d'activation.
 *
 * Il porte ce qu'il faut pour decider sans ouvrir le tableau de bord : qui,
 * quel domaine, quel SIREN, quelle carte, et ce que l'agence a essaye sur sa
 * demonstration. Et il porte la ligne SQL a coller pour activer, parce que la
 * verification est manuelle pendant le pilote et qu'une action a un pas ne se
 * rate pas.
 *
 * Deux instructions dans le SQL, et pas une : le declencheur de la 0002 remet
 * en decouverte toute agence dont le SIREN change. Ici il ne change pas, mais
 * l'habitude vaut d'etre prise la ou on lit.
 */

export type DemandeActivation = {
  agenceId: string
  nom: string
  domaine: string
  siren: string
  cartePro: string
  demandeePar: string
  essais: { consultations: number; piecesOuvertes: number; dossiersPris: number }
}

export async function notifierDemandeActivation(demande: DemandeActivation): Promise<boolean> {
  const sujet = `Activation demandee : ${demande.nom} (${demande.domaine})`

  const corps = [
    `Agence     : ${demande.nom}`,
    `Domaine    : ${demande.domaine}`,
    `SIREN      : ${demande.siren}`,
    `Carte pro  : ${demande.cartePro}`,
    `Demandeur  : ${demande.demandeePar}`,
    '',
    'Sur sa demonstration :',
    `  ${demande.essais.consultations} consultation(s) de dossier`,
    `  ${demande.essais.piecesOuvertes} piece(s) ouverte(s)`,
    `  ${demande.essais.dossiersPris} dossier(s) pris`,
    '',
    'Verifier le SIREN : https://annuaire-entreprises.data.gouv.fr/entreprise/' + demande.siren,
    '',
    'Pour activer, dans l’editeur SQL Supabase :',
    '',
    `  update public.agences set statut = 'verifiee', verifiee_le = now()`,
    `   where id = '${demande.agenceId}';`,
    '',
    'Cloison',
  ].join('\n')

  try {
    return await envoyer(env.emailDestinataire, sujet, corps, undefined, demande.demandeePar)
  } catch {
    console.error('[activation] notification impossible')
    return false
  }
}
