'use server'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { versionConditions } from '@/lib/garant/version-conditions'
import { ouvrirMaitresse } from '@/lib/coffre/rotation-maitresse'
import { cleDuDossier } from '@/lib/coffre/depot'
import { baseSupabase, depuisBytea, versBytea, lireCleScellee } from '@/lib/coffre/depot-supabase'
import {
  chiffrerBrouillon,
  dechiffrerBrouillon,
  schemaBrouillon,
  type SaisieBrouillon,
} from './format'
import { brouillons as t } from '@/lib/content/brouillons'
export type EtatBrouillon = {
  revision?: string | null
  saisie?: SaisieBrouillon
  expiration?: string
  message?: string
  erreur?: string
}
export async function gererBrouillon(_etat: EtatBrouillon, form: FormData): Promise<EtatBrouillon> {
  try {
    const porteur = await capaciteDepuisCookies()
    if (
      !porteur ||
      porteur.capacite.partie !== 'garant' ||
      !formulaireDuDossier(form, porteur.capacite.dossierId)
    )
      return { erreur: t.erreur }
    const version = versionConditions(form)
    if (version === null) return { erreur: t.conflit }
    const db = clientPorteurDeLien(porteur.jeton)
    const dossier = porteur.capacite.dossierId
    const operation = form.get('brouillonOperation')
    if (operation === 'lire') {
      const { data, error } = await db.rpc('mon_brouillon_engagement')
      if (error || !Array.isArray(data) || data.length > 1) return { erreur: t.erreur }
      const b = data[0]
      if (!b) return { revision: null, message: t.absent }
      if (
        !estUuidCanonique(b.revision) ||
        b.version_conditions !== version ||
        !Number.isFinite(Date.parse(b.expire_le))
      )
        return { erreur: t.erreur }
      if (b.chiffre === null) return { revision: b.revision, message: t.absent }
      const chiffre = depuisBytea(b.chiffre)
      if (!chiffre) return { erreur: t.erreur }
      const enveloppe = await lireCleScellee(db, dossier)
      if (!enveloppe) return { erreur: t.erreur }
      const cle = ouvrirMaitresse(enveloppe)
      const saisie = dechiffrerBrouillon(chiffre, dossier, version, cle)
      // La cle et le contenu ne dispensent pas d'une relecture apres dechiffrement.
      const apres = await db.rpc('mon_brouillon_engagement')
      if (apres.error || apres.data?.length !== 1 || apres.data[0].revision !== b.revision)
        return { erreur: t.conflit }
      return { revision: b.revision, saisie, expiration: b.expire_le }
    }
    if (operation !== 'sauver' && operation !== 'supprimer') return { erreur: t.erreur }
    const revision = form.get('brouillonRevision')
    if (typeof revision !== 'string' || (revision !== '' && !estUuidCanonique(revision)))
      return { erreur: t.conflit }
    let chiffre: string | null = null
    if (operation === 'sauver') {
      const brut = Object.fromEntries(
        ['profil', 'couvre', 'montant', 'revenu', 'jusquAu'].map((n) => [n, form.get(n)]),
      )
      const saisie = schemaBrouillon.safeParse({
        ...brut,
        solidaire: form.get('solidaire') === 'on',
      })
      if (!saisie.success) return { erreur: t.erreur }
      const cle = await cleDuDossier(baseSupabase(db), dossier)
      chiffre = versBytea(chiffrerBrouillon(saisie.data, dossier, version, cle))
    }
    const { data, error } = await db.rpc('sauver_brouillon_engagement', {
      le_chiffre: chiffre,
      la_version: version,
      revision_attendue: revision || null,
    })
    if (error || !estUuidCanonique(data)) return { erreur: t.conflit }
    return { revision: data, message: operation === 'sauver' ? t.sauvegarde : t.supprime }
  } catch {
    return { erreur: t.erreur }
  }
}
