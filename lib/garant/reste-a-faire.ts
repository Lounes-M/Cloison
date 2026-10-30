import { naturesDuProfil, type ProfilRessources } from '@/lib/content/garant'

/**
 * Ce qu'il reste au garant, dans l'ordre ou il vaut mieux le faire.
 *
 * Miroir lisible de `pieces_declarees_suffisantes` (migration 0045) : memes
 * natures par profil, memes volumes, et la meme equivalence entre les deux
 * bilans et l'attestation de ressources. Une piece dont l'agence a demande le
 * remplacement ne compte plus, comme cote base. Ce calcul guide l'ecran ; la
 * base reste seule juge de ce qui part a l'agence.
 */
export type EtapeRestante =
  | { sorte: 'engagement' }
  | { sorte: 'complement'; nombre: number }
  | { sorte: 'piece'; nature: string; libelle: string; manque: number; attendu: number }
  | { sorte: 'mention' }

export function resteAFaire({
  profil,
  engagement,
  pieces,
  demandes,
  mentionAttendue,
}: {
  profil: ProfilRessources
  engagement: { revenuDeclare: boolean; montantDeclare: boolean; mentionApposee: boolean } | null
  pieces: { id: string; type: string; nombre_documents?: number | null }[]
  demandes: { etat: string; piece_initiale: string }[]
  mentionAttendue: boolean
}): EtapeRestante[] {
  const etapes: EtapeRestante[] = []
  if (!engagement || !engagement.revenuDeclare || !engagement.montantDeclare) {
    etapes.push({ sorte: 'engagement' })
  }

  const enAttente = demandes.filter((d) => d.etat === 'demande').length
  if (enAttente > 0) etapes.push({ sorte: 'complement', nombre: enAttente })

  const ecartees = new Set(demandes.map((d) => d.piece_initiale))
  const volume = (nature: string) =>
    pieces
      .filter((p) => p.type === nature && !ecartees.has(p.id))
      .reduce((s, p) => s + (p.nombre_documents ?? 1), 0)
  const attestation = volume('attestation_ressources') > 0
  for (const nature of naturesDuProfil(profil)) {
    if (nature.attendu === 0) continue
    if (nature.valeur === 'bilan_comptable' && attestation) continue
    const manque = nature.attendu - volume(nature.valeur)
    if (manque > 0) {
      etapes.push({
        sorte: 'piece',
        nature: nature.valeur,
        libelle: nature.libelle,
        manque,
        attendu: nature.attendu,
      })
    }
  }

  if (mentionAttendue && !engagement?.mentionApposee) etapes.push({ sorte: 'mention' })
  return etapes
}
