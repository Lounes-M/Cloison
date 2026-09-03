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
const SEAU = 'pieces'

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

export function baseSupabase(supabase: SupabaseClient): DepotBase {
  return {
    async cleScellee(dossierId) {
      const { data, error } = await supabase
        .from('cles_dossier')
        .select('cle_scellee')
        .eq('dossier_id', dossierId)
        .maybeSingle()

      if (error) {
        console.error('[coffre] lecture de la cle impossible', error)
        return null
      }

      return data ? depuisBytea(data.cle_scellee) : null
    },

    async poserCleScellee(dossierId, scellee) {
      const { error } = await supabase
        .from('cles_dossier')
        .insert({ dossier_id: dossierId, cle_scellee: versBytea(scellee) })

      if (!error) return 'posee'

      // Une course perdue n'est pas une panne : quelqu'un a pose la cle entre
      // notre lecture et notre ecriture, et `depot.ts` sait quoi en faire.
      if (error.code === DOUBLON) return 'deja'

      console.error('[coffre] pose de la cle refusee', error)
      return 'echec'
    },

    async televerser(chemin, scelle) {
      const { error } = await supabase.storage.from(SEAU).upload(chemin, scelle, {
        // Des octets scelles ne sont d'aucun type. Annoncer autre chose
        // inviterait un navigateur a les interpreter le jour ou ils seraient
        // servis directement.
        contentType: 'application/octet-stream',
        // Jamais d'ecrasement : le nom est tire au hasard, une collision
        // signalerait un probleme qu'il vaut mieux voir echouer.
        upsert: false,
      })

      if (error) {
        console.error('[coffre] televersement refuse', error)
        return false
      }

      return true
    },

    async retirerObjet(chemin) {
      const { error } = await supabase.storage.from(SEAU).remove([chemin])

      // On ne remonte pas cet echec : il survient pendant le rattrapage d'un
      // autre echec, et l'objet reste chiffre, sans ligne qui le designe.
      if (error) console.error('[coffre] objet orphelin non retire', chemin, error)
    },

    async inscrirePiece(piece: PieceAInscrire) {
      const { error } = await supabase.from('pieces').insert({
        dossier_id: piece.dossierId,
        type: piece.nature,
        chemin: piece.chemin,
        taille_octets: piece.tailleOctets,
        type_reel: piece.typeReel,
      })

      if (error) {
        console.error('[coffre] inscription de la piece refusee', error)
        return false
      }

      return true
    },
  }
}
