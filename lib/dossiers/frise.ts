import { frise as friseFr } from '@/lib/content/frise'
import { frise as friseEn } from '@/lib/content/en/frise'
import { choisir, type Langue } from '@/lib/i18n'
import { suiviLocataire, type EtapeDossier } from '@/lib/locataire/reste-a-faire'

export type EtatEtape = keyof typeof friseFr.etats
export type Etape = { titre: string; etat: EtatEtape }

/**
 * Pose les etats d'une suite d'etapes : tout ce qui precede l'etape courante
 * est fait, tout ce qui suit est a venir. Une etape courante `arrete` arrete
 * la frise la ou le dossier s'est arrete.
 */
function suite(titres: string[], courante: number, arret = false): Etape[] {
  return titres.map((titre, i) => ({
    titre,
    etat: i < courante ? 'fait' : i > courante ? 'avenir' : arret ? 'arrete' : 'encours',
  }))
}

/**
 * La frise du locataire, a partir de l'etape en cours.
 *
 * `rattachement` remplace le titre de la decision : tant qu'aucune agence ne
 * suit le dossier, la decision n'a pas commence.
 */
export function friseDepuisEtape(
  etape: EtapeDossier,
  langue: Langue,
  garantDesigne: boolean,
): Etape[] {
  const e = choisir(langue, friseFr, friseEn).locataire.etapes
  const titres = [
    e.ouverture,
    garantDesigne ? e.garant : e.garantADesigner,
    e.depot,
    etape === 'rattachement' ? e.rattachement : e.decision,
    e.signature,
  ]
  switch (etape) {
    case 'loyer':
    case 'paiement':
    case 'garant':
      return suite(titres, 1)
    case 'attente':
    case 'depot':
      return suite(titres, 2)
    case 'insuffisant':
      return suite(titres, 2, true)
    case 'rattachement':
    case 'decision':
      return suite(titres, 3)
    case 'refuse':
      return suite(titres, 3, true)
    case 'signature':
      return suite(titres, 4)
    case 'signe':
      return suite(titres, titres.length)
    default:
      return suite(titres, 0)
  }
}

/**
 * Le locataire voit les statuts tels quels : la frise n'en apprend pas davantage.
 *
 * Sans precision, un dossier `complet` est traite comme suivi par une agence :
 * les appelants qui connaissent le rattachement passent par `friseDepuisEtape`.
 */
export function etapesLocataire(
  statut: string,
  garantDesigne: boolean,
  langue: Langue = 'fr',
  options: { agence?: boolean; demonstration?: boolean } = {},
): Etape[] {
  const suivi = suiviLocataire({
    statut,
    loyerDeclare: true,
    aRegler: false,
    garantDesigne,
    agence: options.agence ?? true,
    demonstration: options.demonstration ?? false,
  })
  return friseDepuisEtape(suivi.etape, langue, garantDesigne)
}

/**
 * Le garant ne lit pas de verdict : complet et garant insuffisant donnent la
 * meme frise.
 *
 * L'etape des pieces n'est terminee que lorsque le serveur a juge le depot
 * suffisant (`pieces_suffisantes`) : le statut est alors `complet` ou
 * `garant_insuffisant`. `ouvert` et `depot_en_cours` laissent l'etape en
 * cours, meme si une piece est deja la. Une piece deposee ne suffit pas.
 */
export function etapesGarant(statut: string, langue: Langue = 'fr'): Etape[] {
  const e = choisir(langue, friseFr, friseEn).garant.etapes
  const titres = [e.invitation, e.depot, e.decision, e.signature]
  switch (statut) {
    case 'ouvert':
    case 'depot_en_cours':
      return suite(titres, 1)
    case 'complet':
    case 'garant_insuffisant':
      return suite(titres, 2)
    case 'refuse':
      return suite(titres, 2, true)
    case 'transmis':
      return suite(titres, 3)
    case 'signe':
      return suite(titres, titres.length)
    default:
      return suite(titres, 1)
  }
}
