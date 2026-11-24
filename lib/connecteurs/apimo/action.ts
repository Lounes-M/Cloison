'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ouvrirDossierAvecLien } from '@/lib/acces/session'
import { contexteAgence } from '@/lib/agences/contexte'
import { apimo as tFr } from '@/lib/content/apimo'
import { apimo as tEn } from '@/lib/content/en/apimo'
import { reprendreLivraisonLiens } from '@/lib/courriels/livraison-liens'
import { lireLoyer, messageLoyer } from '@/lib/garant/validation'
import { choisir, versLangue } from '@/lib/i18n'
import { reglerLangueDossier } from '@/lib/langue-preferee'
import { langueEspace } from '@/lib/langue-espace'
import { traducteur } from '@/lib/messages'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { accesApimo, noterApimo } from './acces'
import { codeApimo, creerClientApimo, libelleDuBien } from './client'
import { apimoActif } from './configuration'
import { identifiantApimo, jetonApimo, scellerIdentifiantsApimo } from './secret'

/**
 * Ce qu'une agence fait de sa connexion Apimo (migration 0096).
 *
 * Les droits sont en base : seul un administrateur sous MFA configure ou
 * retire, seul un membre de l'agence lit et relie. Ces actions ne font que
 * rendre un message propre avant l'appel ; elles ne protegent rien seules.
 */

export type MotifApimo = keyof typeof tFr.echecs
export type EtatApimo =
  { ok: true; fait: keyof typeof tFr.succes } | { ok: false; motif: MotifApimo }

const echec = (motif: MotifApimo): EtatApimo => ({ ok: false, motif })

const saisie = z.strictObject({
  fournisseur: identifiantApimo,
  agenceApimo: identifiantApimo,
  jeton: jetonApimo,
})

export async function gererApimo(form: FormData): Promise<EtatApimo> {
  try {
    if (!apimoActif()) return echec('general')
    const contexte = await contexteAgence()
    if (
      contexte.etat !== 'rattache' ||
      contexte.role !== 'admin' ||
      form.get('agence') !== contexte.agence.id ||
      form.get('confirmation') !== 'on'
    )
      return echec('session')
    const operation = form.get('operation')
    const retour = form.get('retour') === 'on'

    if (operation === 'retirer') {
      const { data, error } = await contexte.supabase.rpc('retirer_apimo')
      if (error || data !== true) return echec('general')
      revalidatePath('/espace/connecteurs')
      return { ok: true, fait: 'retire' }
    }

    if (operation === 'retour') {
      const { data, error } = await contexte.supabase.rpc('regler_retour_apimo', {
        le_retour: retour,
      })
      if (error || data !== true) return echec('general')
      revalidatePath('/espace/connecteurs')
      return { ok: true, fait: 'retour' }
    }

    if (operation !== 'configurer') return echec('general')
    const lu = saisie.safeParse({
      fournisseur: String(form.get('fournisseur') ?? '').trim(),
      agenceApimo: String(form.get('agenceApimo') ?? '').trim(),
      jeton: String(form.get('jeton') ?? '').trim(),
    })
    if (!lu.success) return echec('saisie')

    // Rien n'est enregistre avant qu'Apimo ait accepte ces identifiants pour
    // cette agence : une connexion enregistree est une connexion qui a lu.
    try {
      await creerClientApimo(lu.data, { budget: AbortSignal.timeout(12_000) }).verifier()
    } catch (erreur) {
      const code = codeApimo(erreur)
      console.error('[apimo] verification des identifiants refusee')
      return echec(code === 'incertain' ? 'indisponible' : code)
    }

    const { data, error } = await contexte.supabase.rpc('configurer_apimo', {
      le_fournisseur: lu.data.fournisseur,
      l_agence_apimo: lu.data.agenceApimo,
      le_jeton_scelle: scellerIdentifiantsApimo({ agence: contexte.agence.id, ...lu.data }),
      le_retour: retour,
    })
    if (error || data !== true) return echec('general')
    revalidatePath('/espace/connecteurs')
    return { ok: true, fait: 'configure' }
  } catch {
    console.error('[apimo] operation de connexion impossible')
    return echec('general')
  }
}

export type EtatOuvertureApimo =
  | { statut: 'inactif' }
  | { statut: 'ouvert'; email: string; incomplet?: true }
  | { statut: 'erreur'; message: string; valeur?: string; loyer?: string; bail?: string }

const courrielLocataire = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "L'adresse du locataire est requise.")
  .max(180, 'Cette adresse est trop longue.')
  .pipe(z.email('Cette adresse ne ressemble pas à une adresse e-mail.'))

const OUVERTURE_IMPOSSIBLE = "Le dossier n'a pas pu être ouvert. Réessayez dans un instant."

/**
 * Ouvrir un dossier depuis un bien Apimo, ou depuis un bail de ce bien.
 *
 * Le navigateur n'envoie que l'identifiant du bien : son libelle et son prix
 * sont relus chez Apimo, avec les identifiants de l'agence. Un identifiant
 * qui n'est pas dans ses biens a louer n'ouvre rien.
 */
export async function ouvrirDepuisApimo(
  _precedent: EtatOuvertureApimo,
  donnees: FormData,
): Promise<EtatOuvertureApimo> {
  const langue = await langueEspace()
  const dire = traducteur(langue)
  const t = choisir(langue, tFr, tEn)

  const valeur = String(donnees.get('courriel') ?? '')
  const loyerSaisi = String(donnees.get('loyer') ?? '')
  const bailSaisi = String(donnees.get('bail') ?? '').trim()
  const rappel = { valeur, loyer: loyerSaisi, bail: bailSaisi }
  const erreur = (message: string): EtatOuvertureApimo => ({ statut: 'erreur', message, ...rappel })

  const courriel = courrielLocataire.safeParse(valeur)
  if (!courriel.success)
    return erreur(dire(courriel.error.issues[0]?.message ?? 'Adresse invalide.'))
  const loyer = lireLoyer(loyerSaisi)
  if (!loyer.ok) return erreur(messageLoyer(loyer.motif, langue))
  const bien = String(donnees.get('bien') ?? '')
  if (!/^[0-9]{1,12}$/.test(bien)) return erreur(t.ouverture.erreurs.bien)
  const bail = bailSaisi === '' ? null : bailSaisi
  if (bail !== null && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(bail))
    return erreur(t.ouverture.erreurs.bail)

  try {
    const contexte = await contexteAgence()
    if (contexte.etat !== 'rattache') return erreur(dire('Session expirée.'))
    if (contexte.agence.statut !== 'verifiee') return erreur(t.ouverture.erreurs.nonVerifiee)

    const acces = await accesApimo(contexte, AbortSignal.timeout(20_000))
    if (acces.etat === 'ferme' || acces.etat === 'absent') return erreur(t.ouverture.nonConnecte)
    if (acces.etat !== 'pret') return erreur(t.echecs[acces.etat])

    let fiche
    try {
      fiche = (await acces.client.lireBiensALouer()).biens.find((b) => b.id === bien)
      await noterApimo(contexte, 'ok')
    } catch (cause) {
      const code = codeApimo(cause)
      console.error('[apimo] lecture du bien impossible')
      await noterApimo(contexte, code)
      return erreur(t.echecs[code === 'incertain' ? 'indisponible' : code])
    }
    if (!fiche) return erreur(t.ouverture.erreurs.bienAbsent)

    const { data: logement, error: refusLogement } = await contexte.supabase.rpc(
      'logement_du_bien_apimo',
      { le_bien: fiche.id, le_libelle: libelleDuBien(fiche), le_loyer_cents: fiche.loyerCents },
    )
    if (refusLogement || !estUuidCanonique(logement)) return erreur(dire(OUVERTURE_IMPOSSIBLE))

    // Avec le client de l'agence : c'est ce qui rattache le dossier a l'agence.
    const ouvert = await ouvrirDossierAvecLien(courriel.data, contexte.supabase)
    if (!ouvert) return erreur(dire(OUVERTURE_IMPOSSIBLE))

    // A partir d'ici le dossier existe : un complement refuse ne le defait pas.
    let incomplet = false
    const complement: { logement_id: string; loyer_cents?: number } = { logement_id: logement }
    const loyerInitial = loyer.cents ?? fiche.loyerCents
    if (loyerInitial !== null) complement.loyer_cents = loyerInitial
    const { error: refusComplement } = await contexte.supabase
      .from('dossiers')
      .update(complement)
      .eq('id', ouvert.dossierId)
    if (refusComplement) {
      console.error('[apimo] complement d ouverture non enregistre')
      incomplet = true
    }
    const { data: lie, error: refusLien } = await contexte.supabase.rpc('lier_dossier_apimo', {
      le_dossier: ouvert.dossierId,
      le_bien: fiche.id,
      le_bail: bail,
    })
    if (refusLien || lie !== true) {
      console.error('[apimo] lien du dossier non enregistre')
      incomplet = true
    }

    await reglerLangueDossier(
      ouvert.dossierId,
      'locataire',
      versLangue(donnees.get('langueLocataire') ?? langue),
    )
    await reprendreLivraisonLiens(ouvert.dossierId)

    revalidatePath('/espace')
    revalidatePath('/espace/apimo')
    return incomplet
      ? { statut: 'ouvert', email: courriel.data, incomplet: true }
      : { statut: 'ouvert', email: courriel.data }
  } catch {
    console.error('[apimo] ouverture impossible')
    return erreur(dire(OUVERTURE_IMPOSSIBLE))
  }
}
