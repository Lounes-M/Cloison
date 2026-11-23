import 'server-only'

import { identiteEditeur as identiteEn } from '@/lib/content/en/juridique'
import { identiteEditeur as identiteFr } from '@/lib/content/juridique'
import { choisir, type Langue } from '@/lib/i18n'

/**
 * L'identite de l'editeur, telle que les pages juridiques l'affichent.
 *
 * L'identite de la societe (denomination, forme, capital, SIREN, RCS, siege,
 * contact, directeur de la publication) est ecrite dans `lib/content/`, une
 * fois par langue : elle se traduit donc avec le reste de la page, ce qu'une
 * variable d'environnement ne permet pas.
 *
 * Restent declares par variable, lus au rendu, les seuls elements qui
 * dependent d'une decision d'exploitation : `EDITEUR_TVA` (regime fiscal
 * reel), `EDITEUR_TELEPHONE` (facultatif) et le mediateur de la consommation
 * (`MEDIATEUR_NOM`, `MEDIATEUR_SITE`).
 *
 * Un mediateur absent ou mal forme ne disparait pas en silence : il est liste
 * dans `manquants` et la page porte l'attribut `data-editeur-incomplet`, que
 * le controle de production (`scripts/verifier-production.mjs`) refuse. Le
 * site reste servi : c'est une alerte, pas une panne.
 */

export type ChampEditeur = 'mediateur'

export type Editeur = {
  denomination: string
  forme: string
  capital: string
  siren: string
  rcs: string
  tva: string | null
  adresse: string
  telephone: string | null
  courriel: string
  directeurPublication: string
  mediateur: { nom: string; site: string } | null
  manquants: ChampEditeur[]
}

function lire(nom: string): string | null {
  const valeur = process.env[nom]?.trim()
  return valeur ? valeur.slice(0, 300) : null
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

export function editeur(langue: Langue = 'fr'): Editeur {
  const identite = choisir(langue, identiteFr, identiteEn)
  const nomMediateur = lire('MEDIATEUR_NOM')
  const siteMediateur = https(lire('MEDIATEUR_SITE'))
  const mediateur =
    nomMediateur && siteMediateur ? { nom: nomMediateur, site: siteMediateur } : null
  return {
    denomination: identite.denomination,
    forme: identite.forme,
    capital: identite.capital,
    siren: identite.siren,
    rcs: identite.rcs,
    tva: lire('EDITEUR_TVA'),
    adresse: identite.adresse,
    telephone: lire('EDITEUR_TELEPHONE'),
    courriel: identite.courriel,
    directeurPublication: identite.directeurPublication,
    mediateur,
    // Le mediateur n'est obligatoire que si le locataire paie : un dossier
    // d'agence ne lui coute rien, mais le paiement en ligne existe bien.
    manquants: mediateur ? [] : ['mediateur'],
  }
}

/** L'editeur tel que les pages l'affichent, dans la langue de la page. */
export const editeurAffiche = editeur

/** La duree affichee des sauvegardes : celle qui est declaree, sinon celle du projet. */
export function retentionAffichee(): number {
  return retentionSauvegardes() ?? identiteFr.sauvegardeJours
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
