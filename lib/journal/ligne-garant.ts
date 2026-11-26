import { journal as journalEn } from '@/lib/content/en/journal'
import { journal as journalFr } from '@/lib/content/journal'
import { choisir, deuxPoints, locale, type Langue } from '@/lib/i18n'

export type AccesGarant = {
  action: string
  acteur: string
  /**
   * Courriel professionnel renvoye par `journal_du_dossier`, ou null.
   * La fonction SQL ne le remplit que pour une agence, et seulement si
   * l'adresse est confirmee et du domaine de l'agence.
   */
  identite: string | null
  quand: string
}

/** L'instant, a l'heure de Paris, avec le fuseau ecrit en toutes lettres. */
export function horlogeParis(iso: string, langue: Langue, fuseau: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const horloge = date.toLocaleString(locale(langue), {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${horloge} (${fuseau})`
}

/**
 * Une ligne de l'historique que le garant lit.
 *
 * L'auteur est le sien (« vous »), celui du locataire, ou l'agence. Le nom
 * d'agence est celui que `agence_de_mon_dossier` a deja le droit de montrer :
 * absent, la ligne dit seulement « l'agence ». Le courriel professionnel
 * n'accompagne l'agence que lorsqu'il est la. Il n'est jamais repris pour un
 * autre acteur, meme si une ligne en portait un.
 */
export function ligneAccesGarant(
  acces: AccesGarant,
  langue: Langue,
  nomAgence: string | null,
): { horloge: string; texte: string } {
  const t = choisir(langue, journalFr, journalEn)
  const horloge = horlogeParis(acces.quand, langue, t.fuseau)
  const action = t.actions[acces.action] ?? t.acces
  const auteur =
    acces.acteur === 'garant'
      ? t.vous
      : acces.acteur === 'agence'
        ? t.agence(nomAgence, acces.identite)
        : (t.acteurs[acces.acteur] ?? t.inconnu)
  return { horloge, texte: `${horloge}${deuxPoints(langue)}${action}${t.par}${auteur}.` }
}
