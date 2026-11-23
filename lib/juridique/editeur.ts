import 'server-only'

import { editeurEnProjet as projetEn } from '@/lib/content/en/juridique'
import { editeurEnProjet as projetFr } from '@/lib/content/juridique'
import { choisir, type Langue } from '@/lib/i18n'

/**
 * L'identite de l'editeur, telle que les pages juridiques l'affichent.
 *
 * Les valeurs declarees viennent des variables `EDITEUR_*`, lues au rendu de
 * chaque page : ce sont des informations publiques par nature, aucune n'est un
 * secret. Tant qu'elles manquent, les pages affichent l'identite enregistree
 * de la societe qui exploite la marque (`editeurAffiche`).
 *
 * Une valeur absente ou mal formee ne disparait pas en silence. Elle est
 * listee dans `manquants` et la page porte l'attribut
 * `data-editeur-incomplet`, que le controle de production
 * (`scripts/verifier-production.mjs`) refuse. Le site reste servi : c'est une
 * alerte, pas une panne.
 */

const OBLIGATOIRES = [
  'denomination',
  'forme',
  'siren',
  'adresse',
  'courriel',
  'directeurPublication',
] as const

export type ChampEditeur = (typeof OBLIGATOIRES)[number] | 'mediateur'

export type Editeur = {
  denomination: string | null
  forme: string | null
  capital: string | null
  siren: string | null
  rcs: string | null
  tva: string | null
  adresse: string | null
  telephone: string | null
  courriel: string | null
  directeurPublication: string | null
  mediateur: { nom: string; site: string } | null
  manquants: ChampEditeur[]
}

function lire(nom: string): string | null {
  const valeur = process.env[nom]?.trim()
  return valeur ? valeur.slice(0, 300) : null
}

/** Neuf chiffres, espaces toleres : un numero mal saisi vaut absent. */
function siren(valeur: string | null): string | null {
  const chiffres = valeur?.replace(/\s+/g, '') ?? ''
  return /^\d{9}$/.test(chiffres) ? chiffres.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : null
}

function courriel(valeur: string | null): string | null {
  return valeur && /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(valeur) ? valeur : null
}

function https(valeur: string | null): string | null {
  if (!valeur) return null
  try {
    const url = new URL(valeur)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function editeur(): Editeur {
  const nomMediateur = lire('MEDIATEUR_NOM')
  const siteMediateur = https(lire('MEDIATEUR_SITE'))
  const valeurs = {
    denomination: lire('EDITEUR_DENOMINATION'),
    forme: lire('EDITEUR_FORME'),
    capital: lire('EDITEUR_CAPITAL'),
    siren: siren(lire('EDITEUR_SIREN')),
    rcs: lire('EDITEUR_RCS'),
    tva: lire('EDITEUR_TVA'),
    adresse: lire('EDITEUR_ADRESSE'),
    telephone: lire('EDITEUR_TELEPHONE'),
    courriel: courriel(lire('EDITEUR_COURRIEL') ?? lire('EMAIL_SUPPORT')),
    directeurPublication: lire('EDITEUR_DIRECTEUR_PUBLICATION'),
    mediateur: nomMediateur && siteMediateur ? { nom: nomMediateur, site: siteMediateur } : null,
  }
  const manquants: ChampEditeur[] = OBLIGATOIRES.filter((champ) => !valeurs[champ])
  // Le mediateur n'est obligatoire que si le locataire paie : un dossier
  // d'agence ne lui coute rien, mais le paiement en ligne existe bien.
  if (!valeurs.mediateur) manquants.push('mediateur')
  return { ...valeurs, manquants }
}

/**
 * L'editeur tel que les pages l'affichent.
 *
 * Sans variable posee, les pages presentent l'identite de repli
 * (`editeurEnProjet`) plutot que des lignes vides : denomination, forme,
 * capital, SIREN, RCS, siege, contact. Ce sont les valeurs du registre du
 * commerce pour la societe qui exploite la marque, jamais des numeros supposes.
 *
 * `manquants` ne change pas : il liste ce que la configuration ne declare pas
 * encore, et la page garde son attribut `data-editeur-incomplet` tant qu'il
 * n'est pas vide. La supervision continue donc de reclamer les vraies valeurs.
 */
export function editeurAffiche(langue: Langue = 'fr'): Editeur {
  const declare = editeur()
  const projet = choisir(langue, projetFr, projetEn)
  return {
    ...declare,
    denomination: declare.denomination ?? projet.denomination,
    forme: declare.forme ?? projet.forme,
    // Le capital de repli n'accompagne que la forme de repli.
    capital: declare.capital ?? (declare.forme ? null : projet.capital),
    siren: declare.siren ?? projet.siren,
    // Le RCS de repli n'accompagne que le SIREN de repli.
    rcs: declare.rcs ?? (declare.siren ? null : projet.rcs),
    adresse: declare.adresse ?? projet.adresse,
    courriel: declare.courriel ?? projet.courriel,
    directeurPublication: declare.directeurPublication ?? projet.directeurPublication,
  }
}

/** La duree affichee des sauvegardes : celle qui est declaree, sinon celle du projet. */
export function retentionAffichee(): number {
  return retentionSauvegardes() ?? projetFr.sauvegardeJours
}

/**
 * Les traitements facultatifs, tels qu'ils sont reellement configures.
 *
 * La politique ne cite un sous-traitant que s'il recoit vraiment des donnees :
 * annoncer OpenRouter alors que l'OCR est coupe, ou le taire alors qu'il est
 * actif, serait faux dans les deux cas.
 */
export function traitementsFacultatifs() {
  return {
    ocr: process.env.OCR_ACTIVE === 'true',
    lectureGarant: process.env.LECTURE_IA_GARANT === 'true',
    // Le sous-traitant nomme est celui qui recoit vraiment l'acte : Docage, ou Youtrust en secours.
    signature:
      process.env.SIGNATURE_PARCOURS_ENABLED !== 'true'
        ? null
        : process.env.SIGNATURE_PRESTATAIRE?.trim() === 'youtrust'
          ? ('youtrust' as const)
          : ('docage' as const),
  }
}

/**
 * La duree de conservation des sauvegardes, en jours, telle que configuree
 * chez Supabase (sauvegardes quotidiennes et PITR). La politique doit la
 * dire : detruire la cle d'un dossier ne neutralise pas une sauvegarde qui la
 * contient encore. Absente ou hors bornes, elle vaut inconnue et la page de
 * confidentialite reste marquee incomplete.
 */
export function retentionSauvegardes(): number | null {
  const valeur = lire('SAUVEGARDE_RETENTION_JOURS')
  if (!valeur || !/^\d{1,3}$/.test(valeur)) return null
  const jours = Number(valeur)
  return jours >= 1 && jours <= 365 ? jours : null
}
