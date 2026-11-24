'use server'

import { revalidatePath } from 'next/cache'

import { ouvrirDossierAvecLien } from '@/lib/acces/session'
import { colocation as texteFr } from '@/lib/content/colocation'
import { colocation as texteEn } from '@/lib/content/en/colocation'
import { reprendreLivraisonLiens } from '@/lib/courriels/livraison-liens'
import { montantEnCents } from '@/lib/garant/validation'
import { choisir, versLangue } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'
import { reglerLangueDossier } from '@/lib/langue-preferee'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { COLOCATAIRES_MAX, lireAdresses, lireGarantis, repartirLoyer } from './colocation'
import { contexteAgence } from './contexte'

/**
 * L'agence ouvre une colocation, ou ajoute un colocataire a une colocation.
 *
 * Un dossier par colocataire, ouvert par le meme chemin qu'un dossier seul
 * (`ouvrir_dossier_avec_lien`), puis rattache a la colocation. Chaque droit
 * est celui que la base accorde deja a l'agence sur ses propres lignes : la
 * colocation ou le logement d'une autre n'existent pas pour elle, et le
 * declencheur de la 0092 refuse ce que ce code laisserait passer.
 *
 * Tout ce qui peut se refuser sans rien ouvrir l'est d'abord : un dossier
 * ouvert puis refuse par la colocation resterait un dossier isole, avec un
 * lien que le locataire attend.
 */

export type EtatColocation =
  | { statut: 'inactif' }
  | { statut: 'ouverte'; colocation: string; ouverts: number; echecs: string[] }
  | { statut: 'erreur'; message: string; courriels?: string; loyer?: string }

const OUVERTS = ['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant', 'transmis', 'signe']

export async function ouvrirUneColocation(
  _precedent: EtatColocation,
  donnees: FormData,
): Promise<EtatColocation> {
  const langue = await langueEspace()
  const t = choisir(langue, texteFr, texteEn)
  const courriels = String(donnees.get('courriels') ?? '')
  const saisieLoyer = String(donnees.get('loyerTotal') ?? '')
  const refuser = (message: string): EtatColocation => ({
    statut: 'erreur',
    message,
    courriels,
    loyer: saisieLoyer,
  })

  const existante = String(donnees.get('colocation') ?? '')
  const brutLogement = String(donnees.get('logement') ?? '')
  if (
    (existante !== '' && !estUuidCanonique(existante)) ||
    (brutLogement !== '' && !estUuidCanonique(brutLogement))
  ) {
    return refuser(t.erreurs.impossible)
  }
  const ajout = existante !== ''

  // Le garant de la premiere adresse peut couvrir plusieurs colocataires
  // (0094) : une colocation de deux s'ouvre alors avec une seule adresse.
  const garantCommun = lireGarantis(donnees.get('garantCommun'))
  if (garantCommun === null) return refuser(t.erreurs.impossible)
  const lues = lireAdresses(courriels, 1)
  if (lues.ok && !ajout && lues.adresses.length + garantCommun - 1 < 2) {
    return refuser(t.erreurs.adresses)
  }
  if (!lues.ok) {
    return refuser(
      lues.motif === 'doublon'
        ? t.erreurs.doublon
        : lues.motif === 'trop'
          ? t.erreurs.trop
          : ajout
            ? t.erreurs.adresse
            : t.erreurs.adresses,
    )
  }
  const { adresses } = lues
  const garantis = adresses.map((_, i) => (i === 0 ? garantCommun : 1))
  const arrivants = adresses.length + garantCommun - 1
  if (arrivants > COLOCATAIRES_MAX) return refuser(t.erreurs.trop)

  let total: number | null = null
  let etendue: 'part' | 'loyer_entier' =
    donnees.get('etendue') === 'loyer_entier' ? 'loyer_entier' : 'part'
  if (!ajout) {
    const lu = montantEnCents(saisieLoyer)
    if (lu === null || lu === 'invalide') return refuser(t.erreurs.loyer)
    total = lu
  }
  // Juger les garants ensemble n'a de sens que s'ils repondent tous du loyer
  // entier ; la base le refuse autrement.
  const solvabilite =
    etendue === 'loyer_entier' && donnees.get('solvabilite') === 'commune'
      ? 'commune'
      : 'individuelle'

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return refuser(t.erreurs.session)
  if (contexte.agence.statut !== 'verifiee') return refuser(t.erreurs.nonVerifiee)
  const { supabase } = contexte

  let colocation: string
  let logement: string | null = null
  let dejaPresents = 0

  if (ajout) {
    // Lue avec les droits de l'agence : celle d'une autre n'existe pas.
    const [{ data: c }, { data: membres, error }] = await Promise.all([
      supabase
        .from('colocations')
        .select('id, logement_id, loyer_total_cents, etendue')
        .eq('id', existante)
        .maybeSingle(),
      supabase
        .from('dossiers')
        .select('email_locataire, email_garant, statut, expire_le, colocataires_garantis')
        .eq('colocation_id', existante)
        .limit(200),
    ])
    if (!c || error) return refuser(t.erreurs.impossible)
    const presents = (membres ?? []).filter(
      (m) => OUVERTS.includes(String(m.statut)) && Date.parse(String(m.expire_le)) > Date.now(),
    )
    if (
      presents.some(
        (m) =>
          adresses.includes(String(m.email_locataire)) ||
          (m.email_garant != null && adresses.includes(String(m.email_garant))),
      )
    ) {
      return refuser(t.erreurs.dejaPresente)
    }
    dejaPresents = presents.reduce((s, m) => s + (Number(m.colocataires_garantis) || 1), 0)
    if (dejaPresents + arrivants > COLOCATAIRES_MAX) return refuser(t.erreurs.trop)
    colocation = String(c.id)
    logement = c.logement_id == null ? null : String(c.logement_id)
    total = Number(c.loyer_total_cents)
    etendue = c.etendue === 'loyer_entier' ? 'loyer_entier' : 'part'
  } else {
    const { data, error } = await supabase
      .from('colocations')
      .insert({
        agence_id: contexte.agence.id,
        logement_id: brutLogement === '' ? null : brutLogement,
        loyer_total_cents: total,
        etendue,
        solvabilite,
      })
      .select('id')
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('[agence] colocation refusee')
      return refuser(t.erreurs.impossible)
    }
    colocation = String(data.id)
    logement = brutLogement === '' ? null : brutLogement
  }

  // A l'ajout, le nouveau venu recoit une part egale du total ; les parts des
  // autres ne bougent pas seules, l'agence les corrige et la fiche le lui dit.
  const parts = repartirLoyer(
    total!,
    etendue,
    dejaPresents > 0 ? [dejaPresents, ...garantis] : garantis,
  ).slice(dejaPresents > 0 ? 1 : 0)
  const langueLocataire = versLangue(donnees.get('langueLocataire') ?? langue)

  let ouverts = 0
  const echecs: string[] = []
  for (const [i, courriel] of adresses.entries()) {
    try {
      const ouvert = await ouvrirDossierAvecLien(courriel, supabase)
      if (!ouvert) {
        echecs.push(courriel)
        continue
      }
      const complement: Record<string, unknown> = {
        colocation_id: colocation,
        loyer_cents: parts[i],
      }
      if (garantis[i]! > 1) complement.colocataires_garantis = garantis[i]
      if (logement) complement.logement_id = logement
      const { data: rattache, error } = await supabase
        .from('dossiers')
        .update(complement)
        .eq('id', ouvert.dossierId)
        .select('id')
      if (error || !Array.isArray(rattache) || rattache.length === 0) {
        // Le dossier existe et son locataire recevra son lien : il reste un
        // dossier seul, que l'agence voit dans sa liste.
        console.error('[agence] dossier ouvert hors colocation')
        echecs.push(courriel)
      } else {
        ouverts += 1
      }
      await reglerLangueDossier(ouvert.dossierId, 'locataire', langueLocataire)
      await reprendreLivraisonLiens(ouvert.dossierId)
    } catch {
      console.error('[agence] ouverture de colocataire impossible')
      echecs.push(courriel)
    }
  }

  if (ouverts === 0) {
    // Une colocation neuve et vide ne sert a rien : elle ne reste pas.
    if (!ajout) await supabase.from('colocations').delete().eq('id', colocation)
    return refuser(t.erreurs.impossible)
  }

  revalidatePath('/espace')
  revalidatePath(`/espace/colocations/${colocation}`)
  return { statut: 'ouverte', colocation, ouverts, echecs }
}

export type EtatReglage =
  { statut: 'inactif' } | { statut: 'fait' } | { statut: 'erreur'; message: string }

/**
 * L'agence choisit de juger les garants ensemble ou chacun seul (0094). La
 * base refuse le mode commun hors bail solidaire, et tout changement une fois
 * un dossier pris ; elle rejuge tous les dossiers dans la meme transaction.
 */
export async function reglerSolvabilite(
  _precedent: EtatReglage,
  donnees: FormData,
): Promise<EtatReglage> {
  const t = choisir(await langueEspace(), texteFr, texteEn)
  const colocation = String(donnees.get('colocation') ?? '')
  const mode = donnees.get('solvabilite') === 'commune' ? 'commune' : 'individuelle'
  if (!estUuidCanonique(colocation)) return { statut: 'erreur', message: t.reglages.impossible }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: t.erreurs.session }
  const { data, error } = await contexte.supabase
    .from('colocations')
    .update({ solvabilite: mode })
    .eq('id', colocation)
    .select('id')
  if (error || !Array.isArray(data) || data.length === 0) {
    return {
      statut: 'erreur',
      message: /deja pris/.test(error?.message ?? '') ? t.reglages.fige : t.reglages.impossible,
    }
  }
  revalidatePath('/espace')
  revalidatePath(`/espace/colocations/${colocation}`)
  return { statut: 'fait' }
}

/**
 * L'agence dit combien de colocataires couvre le garant d'un dossier (0094).
 *
 * En engagement sur la part, le loyer du dossier suit : deux colocataires,
 * deux parts. C'est une proposition, que l'agence corrige sur la fiche ; la
 * fiche de la colocation dit si les parts ne font plus le loyer du bail.
 */
export async function reglerGarantCommun(
  _precedent: EtatReglage,
  donnees: FormData,
): Promise<EtatReglage> {
  const t = choisir(await langueEspace(), texteFr, texteEn)
  const colocation = String(donnees.get('colocation') ?? '')
  const dossier = String(donnees.get('dossier') ?? '')
  const garantis = lireGarantis(donnees.get('garantis'))
  if (!estUuidCanonique(colocation) || !estUuidCanonique(dossier) || garantis === null) {
    return { statut: 'erreur', message: t.reglages.impossible }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: t.erreurs.session }
  const { supabase } = contexte

  const [{ data: c }, { data: avant }] = await Promise.all([
    supabase.from('colocations').select('etendue').eq('id', colocation).maybeSingle(),
    supabase
      .from('dossiers')
      .select('loyer_cents, colocataires_garantis')
      .eq('id', dossier)
      .eq('colocation_id', colocation)
      .maybeSingle(),
  ])
  if (!c || !avant) return { statut: 'erreur', message: t.reglages.impossible }
  const ancien = Number(avant.colocataires_garantis) || 1
  if (ancien === garantis) return { statut: 'fait' }

  const { data, error } = await supabase
    .from('dossiers')
    .update({ colocataires_garantis: garantis })
    .eq('id', dossier)
    .eq('colocation_id', colocation)
    .select('id')
  if (error || !Array.isArray(data) || data.length === 0) {
    const refus = error?.message ?? ''
    return {
      statut: 'erreur',
      message: /au plus huit/.test(refus)
        ? t.erreurs.trop
        : /ne se modifie plus/.test(refus)
          ? t.reglages.garantFige
          : t.reglages.impossible,
    }
  }

  if (c.etendue === 'part' && avant.loyer_cents != null) {
    const loyer = Math.round((Number(avant.loyer_cents) * garantis) / ancien)
    const { error: refusLoyer } = await supabase
      .from('dossiers')
      .update({ loyer_cents: loyer })
      .eq('id', dossier)
    // Un loyer que la base ne laisse plus bouger reste a corriger sur la fiche.
    if (refusLoyer) console.error('[agence] loyer du garant commun inchange')
  }

  revalidatePath(`/espace/colocations/${colocation}`)
  revalidatePath(`/espace/dossiers/${dossier}`)
  return { statut: 'fait' }
}
