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
 * Le mediateur est facultatif pour le rendu : tant qu'il n'est pas declare,
 * les conditions gardent leur texte generique sur la mediation, et aucun
 * controle ne le reclame. Seule la duree des sauvegardes marque encore la
 * page de confidentialite (`data-editeur-incomplet`) quand elle manque.
 */

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
 * La page Confidentialite dit toujours si une piece part chez OpenRouter.
 * Le detail (OCR, lecture du garant, signature) n'apparait que si le
 * traitement tourne vraiment dans cet environnement.
 */
export function traitementsFacultatifs() {
  return {
    ocr: process.env.OCR_ACTIVE === 'true',
    lectureGarant: process.env.LECTURE_IA_GARANT === 'true',
    comparaisonAgence: process.env.COMPARAISON_IA_AGENCE === 'true',
    // Vrai seulement si l'endpoint impose est europeen : le defaut l'est, un
    // autre choix ou « aucun » ne permet plus de l'affirmer.
    lectureEnEurope:
      process.env.OPENROUTER_REGION?.trim() === 'eu' ||
      /^(google-vertex\/europe|amazon-bedrock\/eu-|azure\/eu)/.test(
        process.env.OPENROUTER_EXTRACTION_FOURNISSEUR?.trim() || 'google-vertex/europe',
      ),
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
