import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { DepotBase, PieceAInscrire } from './depot'

/**
 * Le branchement de `DepotBase` sur Supabase.
 *
 * Volontairement mince, et sans aucune regle : tout ce qui decide est dans
 * `depot.ts`, ou une doublure permet de l'eprouver. Ce fichier ne fait que
 * traduire, et la seule chose qu'il traduit vraiment est le `bytea`.
 *
 * Le client passe ici porte le jeton du garant : c'est la RLS qui autorise ou
 * refuse chacun de ces appels, pas une verification faite ici.
 */

/** Le seau des pieces. Prive, cree par la migration 0006. */
export const SEAU = 'pieces'

/**
 * PostgREST rend un `bytea` en hexadecimal prefixe, et l'attend de meme.
 *
 * C'est le genre de detail qui casse en silence : une chaine mal decodee
 * donnerait une cle de la mauvaise taille, donc un chiffrement qui refuse de
 * s'ouvrir bien plus tard. Les deux fonctions sont donc exportees et testees.
 */
const PREFIXE_BYTEA = String.raw`\x`

export function versBytea(octets: Buffer): string {
  return `${PREFIXE_BYTEA}${octets.toString('hex')}`
}

export function depuisBytea(valeur: unknown): Buffer | null {
  if (typeof valeur !== 'string') return null

  const hexadecimal = valeur.startsWith(PREFIXE_BYTEA) ? valeur.slice(2) : valeur
  if (hexadecimal.length === 0 || hexadecimal.length % 2 !== 0) return null
  if (!/^[0-9a-fA-F]+$/.test(hexadecimal)) return null

  return Buffer.from(hexadecimal, 'hex')
}

/** Le code Postgres d'une violation de contrainte d'unicite. */
const DOUBLON = '23505'

/**
 * Lit la cle scellee d'un dossier, partagee par le depot et l'ouverture.
 *
 * Rend `null` sans distinguer l'absence du refus : c'est la RLS qui a decide,
 * et lui faire dire pourquoi renseignerait sur ce qui existe.
 */
export async function lireCleScellee(supabase: SupabaseClient, dossierId: string) {
  const { data, error } = await supabase
    .from('cles_dossier')
    .select('cle_scellee')
    .eq('dossier_id', dossierId)
    .maybeSingle()

  if (error) {
    console.error('[coffre] lecture de la cle impossible')
    return null
  }

  return data ? depuisBytea(data.cle_scellee) : null
}

/** L'inscription au journal, partagee elle aussi. */
export async function inscrireAuJournal(
  supabase: SupabaseClient,
  dossierId: string,
  action: 'piece_deposee' | 'piece_ouverte' | 'piece_retiree',
  pieceId: string,
) {
  // `journaliser` ne prend aucun parametre d'identite : elle lit l'acteur dans
  // le jeton que porte ce client. Il n'y a donc rien a falsifier ici, meme par
  // erreur.
  const { error } = await supabase.rpc('journaliser', {
    le_dossier: dossierId,
    l_action: action,
    la_piece: pieceId,
  })

  if (error) {
    console.error('[coffre] inscription au journal refusee')
    return false
  }

  return true
}

export function baseSupabase(
  supabase: SupabaseClient,
  stockage: SupabaseClient = supabase,
): DepotBase {
  return {
    cleScellee: (dossierId) => lireCleScellee(supabase, dossierId),

    async poserCleScellee(dossierId, scellee) {
      const { error } = await supabase
        .from('cles_dossier')
        .insert({ dossier_id: dossierId, cle_scellee: versBytea(scellee) })

      if (!error) return 'posee'

      // Une course perdue n'est pas une panne : quelqu'un a pose la cle entre
      // notre lecture et notre ecriture, et `depot.ts` sait quoi en faire.
      if (error.code === DOUBLON) return 'deja'

      console.error('[coffre] pose de la cle refusee')
      return 'echec'
    },

    async televerser(chemin, scelle) {
      // La reservation survit au processus, y compris si la reponse de
      // l'upload est perdue. La maintenance arbitre ensuite avec l'inscription.
      const { error: reservation } = await stockage.rpc('reserver_depot', { le_chemin: chemin })
      if (reservation) {
        console.error('[coffre] reservation du depot refusee')
        return false
      }
      const { error } = await stockage.storage.from(SEAU).upload(chemin, scelle, {
        // Des octets scelles ne sont d'aucun type. Annoncer autre chose
        // inviterait un navigateur a les interpreter le jour ou ils seraient
        // servis directement.
        contentType: 'application/octet-stream',
        // Jamais d'ecrasement : le nom est tire au hasard, une collision
        // signalerait un probleme qu'il vaut mieux voir echouer.
        upsert: false,
      })

      if (error) {
        console.error('[coffre] televersement refuse')
        return false
      }

      return true
    },

    async retirerObjet(chemin) {
      // La base arbitre avec l'inscription sous le meme verrou. Une reponse
      // d'inscription perdue ne doit jamais detruire une piece deja inscrite.
      const { error } = await supabase.rpc('programmer_suppression_objet', {
        le_chemin: chemin,
      })
      if (error) console.error('[coffre] programmation du nettoyage impossible')
    },

    async inscrirePiece(piece: PieceAInscrire) {
      const { data, error } = await stockage
        .from('pieces')
        .insert({
          dossier_id: piece.dossierId,
          type: piece.nature,
          chemin: piece.chemin,
          taille_octets: piece.tailleOctets,
          type_reel: piece.typeReel,
          nombre_documents: piece.nombreDocuments ?? 1,
        })
        .select('id')
        .single()

      if (error || !data?.id) {
        console.error('[coffre] inscription de la piece refusee')
        return null
      }

      return data.id as string
    },

    async pieceDeposee(pieceId) {
      const { data, error } = await supabase
        .from('pieces')
        .select('dossier_id, chemin')
        .eq('id', pieceId)
        .maybeSingle()

      if (error || !data) {
        if (error) console.error('[coffre] lecture de la piece impossible')
        return null
      }

      return { dossierId: data.dossier_id as string, chemin: data.chemin as string }
    },

    async supprimerPiece(pieceId) {
      // `select` apres `delete` rend les lignes effectivement supprimees. Sans
      // lui, un refus de la RLS ressemblerait a un succes : zero ligne, zero
      // erreur.
      const { data, error } = await supabase.from('pieces').delete().eq('id', pieceId).select('id')

      if (error) {
        console.error('[coffre] suppression de la piece refusee')
        return false
      }

      return Array.isArray(data) && data.length > 0
    },

    journaliser: (dossierId, action, pieceId) =>
      inscrireAuJournal(supabase, dossierId, action, pieceId),
  }
}
