import { frise } from '@/lib/content/frise'

export type EtatEtape = keyof typeof frise.etats
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

/** Le locataire voit les statuts tels quels : la frise n'en apprend pas davantage. */
export function etapesLocataire(statut: string, garantDesigne: boolean): Etape[] {
  const e = frise.locataire.etapes
  const titres = [e.ouverture, e.garant, e.depot, e.decision, e.signature]
  switch (statut) {
    case 'ouvert':
      return suite(titres, garantDesigne ? 2 : 1)
    case 'depot_en_cours':
      return suite(titres, 2)
    case 'garant_insuffisant':
      return suite(titres, 2, true)
    case 'complet':
      return suite(titres, 3)
    case 'refuse':
      return suite(titres, 3, true)
    case 'transmis':
      return suite(titres, 4)
    case 'signe':
      return suite(titres, titres.length)
    default:
      return suite(titres, 0)
  }
}

/**
 * Le garant ne lit pas de verdict : complet et garant insuffisant donnent la
 * meme frise, qui ne depend que de son propre depot.
 */
export function etapesGarant(statut: string, depotFait: boolean): Etape[] {
  const e = frise.garant.etapes
  const titres = [e.invitation, e.depot, e.decision, e.signature]
  switch (statut) {
    case 'ouvert':
    case 'depot_en_cours':
    case 'complet':
    case 'garant_insuffisant':
      return suite(titres, depotFait ? 2 : 1)
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
