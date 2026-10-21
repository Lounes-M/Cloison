import 'server-only'

/**
 * L'identite de l'editeur, telle que les pages juridiques l'affichent.
 *
 * Rien n'est ecrit en dur : la structure n'est pas encore immatriculee, et une
 * raison sociale inventee serait pire qu'une ligne vide. Les valeurs viennent
 * des variables `EDITEUR_*`, lues au build comme le reste du site public : ce
 * sont des informations publiques par nature, aucune n'est un secret.
 *
 * Une valeur absente ou mal formee ne disparait pas en silence. Elle est
 * listee dans `manquants`, la page l'affiche comme « a completer » et porte
 * l'attribut `data-editeur-incomplet`, que le controle de production
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
 * Les traitements facultatifs, tels qu'ils sont reellement configures.
 *
 * La politique ne cite un sous-traitant que s'il recoit vraiment des donnees :
 * annoncer OpenRouter alors que l'OCR est coupe, ou le taire alors qu'il est
 * actif, serait faux dans les deux cas.
 */
export function traitementsFacultatifs() {
  return {
    ocr: process.env.OCR_ACTIVE === 'true',
    signature: process.env.SIGNATURE_PARCOURS_ENABLED === 'true',
  }
}
