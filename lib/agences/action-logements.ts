'use server'

import { revalidatePath } from 'next/cache'

import { candidature as texteCandidatureFr } from '@/lib/content/candidature'
import { logements as texteFr } from '@/lib/content/logements'
import { prevenirSiLeStatutAChange } from '@/lib/courriels/notifications'
import { lireLoyer, messageLoyer } from '@/lib/garant/validation'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { contexteAgence } from './contexte'
import { candidature as texteCandidatureEn } from '@/lib/content/en/candidature'
import { logements as texteEn } from '@/lib/content/en/logements'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

/**
 * Les logements de l'agence (migration 0069).
 *
 * Droits, appartenance et rattachement sont tenus en base : politique par
 * agence, et declencheur qui refuse un logement d'une autre agence ou le
 * dossier d'un second garant. Ces actions n'empruntent que ces droits.
 */

export type EtatLogement =
  { statut: 'inactif' } | { statut: 'enregistre' } | { statut: 'erreur'; message: string }

export async function creerUnLogement(_p: EtatLogement, donnees: FormData): Promise<EtatLogement> {
  const langue = await langueEspace()
  const texte = choisir(langue, texteFr, texteEn)

  const libelle = String(donnees.get('libelle') ?? '').trim()
  const lu = lireLoyer(String(donnees.get('loyer') ?? ''))
  if (libelle.length === 0 || libelle.length > 120) {
    return { statut: 'erreur', message: texte.erreurs.libelle }
  }
  if (!lu.ok) return { statut: 'erreur', message: messageLoyer(lu.motif, langue) }
  const loyer = lu.cents

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: texte.erreurs.session }

  const { error } = await contexte.supabase
    .from('logements')
    .insert({ agence_id: contexte.agence.id, libelle, loyer_cents: loyer })
  if (error) {
    console.error('[agence] logement non cree')
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  revalidatePath('/espace/logements')
  return { statut: 'enregistre' }
}

/** Archiver ou reactiver : un formulaire d'un seul bouton. */
export async function archiverUnLogement(donnees: FormData): Promise<void> {
  const id = String(donnees.get('logement') ?? '')
  const archive = donnees.get('archive') === 'oui'
  if (!estUuidCanonique(id)) return
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return
  const { error } = await contexte.supabase.from('logements').update({ archive }).eq('id', id)
  if (error) console.error('[agence] logement non archive')
  revalidatePath('/espace/logements')
  revalidatePath(`/espace/logements/${id}`)
}

/** Rattacher un dossier a un logement, ou l'en detacher (valeur vide). */
export async function rattacherAuLogement(
  _p: EtatLogement,
  donnees: FormData,
): Promise<EtatLogement> {
  const langue = await langueEspace()
  const texte = choisir(langue, texteFr, texteEn)

  const dossier = String(donnees.get('dossier') ?? '')
  const brut = String(donnees.get('logement') ?? '')
  const logement = brut === '' ? null : brut
  if (!estUuidCanonique(dossier) || (logement !== null && !estUuidCanonique(logement))) {
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: texte.erreurs.session }

  const { data, error } = await contexte.supabase
    .from('dossiers')
    .update({ logement_id: logement })
    .eq('id', dossier)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[agence] rattachement au logement refuse')
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  revalidatePath(`/espace/dossiers/${dossier}`)
  return { statut: 'enregistre' }
}

export type EtatAttribution =
  | { statut: 'inactif' }
  | { statut: 'attribue'; refuses: number; enCours: number }
  | { statut: 'erreur'; message: string }

/** Statuts que le refus accepte, comme `refuserLeDossier`. */
const REFUSABLES = ['complet', 'garant_insuffisant', 'transmis'] as const

/**
 * Attribuer un logement au candidat retenu.
 *
 * Le dossier retenu doit etre pris (ou signe) et rattache a ce logement. Le
 * logement est archive d'abord ; les autres dossiers refusables recoivent
 * ensuite le refus ordinaire, sans motif, et chacun est prevenu comme par
 * le bouton du dossier. Les droits restent ceux de l'agence : un dossier
 * d'une autre agence n'est ni lu ni ecrit. Rejouer l'action ne refuse que
 * ce qui ne l'a pas encore ete.
 */
export async function attribuerLeLogement(
  _p: EtatAttribution,
  donnees: FormData,
): Promise<EtatAttribution> {
  const langue = await langueEspace()
  const texte = choisir(langue, texteFr, texteEn)

  const logement = String(donnees.get('logement') ?? '')
  const retenu = String(donnees.get('dossier') ?? '')
  if (!estUuidCanonique(logement) || !estUuidCanonique(retenu)) {
    return { statut: 'erreur', message: texte.attribution.erreurs.candidat }
  }
  if (donnees.get('confirme') !== 'oui') {
    return { statut: 'erreur', message: texte.attribution.erreurs.confirmation }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: texte.erreurs.session }

  const { data: candidat, error: lecture } = await contexte.supabase
    .from('dossiers')
    .select('id')
    .eq('id', retenu)
    .eq('logement_id', logement)
    .in('statut', ['transmis', 'signe'])
    .maybeSingle()
  if (lecture || !candidat) {
    if (lecture) console.error('[agence] candidat retenu illisible')
    return { statut: 'erreur', message: texte.attribution.erreurs.candidat }
  }

  const { data: archive, error: archivage } = await contexte.supabase
    .from('logements')
    .update({ archive: true })
    .eq('id', logement)
    .select('id')
    .maybeSingle()
  if (archivage || !archive) {
    if (archivage) console.error('[agence] logement non attribue')
    return { statut: 'erreur', message: texte.erreurs.general }
  }

  const { data: refuses, error: refus } = await contexte.supabase
    .from('dossiers')
    .update({ statut: 'refuse' })
    .eq('logement_id', logement)
    .neq('id', retenu)
    .in('statut', [...REFUSABLES])
    .select('id')

  revalidatePath('/espace/logements')
  revalidatePath(`/espace/logements/${logement}`)
  revalidatePath('/espace')
  if (refus || !Array.isArray(refuses)) {
    console.error('[agence] refus des autres candidats incomplet')
    return { statut: 'erreur', message: texte.attribution.erreurs.refus }
  }

  // Chaque refus se dit comme celui du bouton : la base sait quoi envoyer.
  for (const { id } of refuses as { id: string }[]) {
    await prevenirSiLeStatutAChange(contexte.supabase, id, null)
    revalidatePath(`/espace/dossiers/${id}`)
  }

  // Un dossier encore incomplet ne se refuse pas : il reste ouvert et son
  // candidat n'apprend rien. L'agence sait combien il lui en reste a clore.
  const { data: restants, error: lectureRestants } = await contexte.supabase
    .from('dossiers')
    .select('id')
    .eq('logement_id', logement)
    .neq('id', retenu)
    .in('statut', ['ouvert', 'depot_en_cours'])
  if (lectureRestants) console.error('[agence] candidats en cours illisibles')
  return {
    statut: 'attribue',
    refuses: refuses.length,
    enCours: Array.isArray(restants) ? restants.length : 0,
  }
}

/**
 * Ouvrir, renouveler ou fermer le lien de candidature (migration 0070).
 *
 * La base tire le code et verifie que le logement est a l'agence et, pour
 * l'ouvrir, qu'il n'est pas archive. Renouveler revoque l'ancien lien.
 */
export async function reglerLaCandidature(donnees: FormData): Promise<void> {
  const id = String(donnees.get('logement') ?? '')
  const ouvrir = donnees.get('candidature') === 'ouvrir'
  if (!estUuidCanonique(id)) return
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return
  const { error } = await contexte.supabase.rpc('regler_candidature_logement', {
    le_logement: id,
    ouvrir,
  })
  if (error) console.error('[agence] lien de candidature non regle')
  revalidatePath(`/espace/logements/${id}`)
}

/** Un entier facultatif dans des bornes : null s'il est vide, 'invalide' sinon. */
function entierFacultatif(brut: string, min: number, max: number): number | null | 'invalide' {
  if (brut === '') return null
  if (!/^\d{1,4}$/.test(brut)) return 'invalide'
  const n = Number(brut)
  return n >= min && n <= max ? n : 'invalide'
}

/**
 * Decrire le bien pour la page du lien de candidature (migration 0072).
 * Chaque champ est facultatif ; vide, il efface la valeur.
 */
export async function decrireLeLogement(
  _p: EtatLogement,
  donnees: FormData,
): Promise<EtatLogement> {
  const langue = await langueEspace()
  const texteCandidature = choisir(langue, texteCandidatureFr, texteCandidatureEn)
  const texte = choisir(langue, texteFr, texteEn)

  const t = texteCandidature.description.erreurs
  const id = String(donnees.get('logement') ?? '')
  if (!estUuidCanonique(id)) return { statut: 'erreur', message: texte.erreurs.general }
  const ville = String(donnees.get('ville') ?? '').trim()
  if (ville.length > 80) return { statut: 'erreur', message: t.ville }
  const surface = entierFacultatif(String(donnees.get('surface') ?? '').trim(), 5, 1000)
  if (surface === 'invalide') return { statut: 'erreur', message: t.surface }
  const pieces = entierFacultatif(String(donnees.get('pieces') ?? '').trim(), 1, 20)
  if (pieces === 'invalide') return { statut: 'erreur', message: t.pieces }
  const meuble = { oui: true, non: false }[String(donnees.get('meuble') ?? '')] ?? null
  const date = String(donnees.get('disponible') ?? '')
  if (date !== '' && !(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)))) {
    return { statut: 'erreur', message: t.date }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: texte.erreurs.session }
  const { data, error } = await contexte.supabase
    .from('logements')
    .update({
      ville: ville === '' ? null : ville,
      surface_m2: surface,
      pieces,
      meuble,
      disponible_le: date === '' ? null : date,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[agence] description du logement refusee')
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  revalidatePath(`/espace/logements/${id}`)
  return { statut: 'enregistre' }
}
