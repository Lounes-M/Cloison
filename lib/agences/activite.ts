/** Une ligne de `activite_de_mon_agence` (0068). */
export type MoisActivite = {
  mois: string
  ouverts: number
  pris: number
  refuses: number
  signes: number
  clos: number
  delai_prise_moyen_jours: string | number | null
}

/** Totaux sur la periode, calcules sans revenir aux dossiers. Pur, donc testable. */
export function totauxActivite(lignes: MoisActivite[]) {
  let ouverts = 0
  let pris = 0
  let refuses = 0
  let joursPonderes = 0
  for (const l of lignes) {
    ouverts += l.ouverts
    pris += l.pris
    refuses += l.refuses
    if (l.pris > 0 && l.delai_prise_moyen_jours != null) {
      joursPonderes += Number(l.delai_prise_moyen_jours) * l.pris
    }
  }
  const decisions = pris + refuses
  return {
    ouverts,
    acceptation: decisions === 0 ? null : Math.round((pris / decisions) * 100),
    delaiJours: pris === 0 ? null : Math.round((joursPonderes / pris) * 10) / 10,
  }
}

/** « octobre 2026 », dans le fuseau de l'agence. */
export function libelleMois(mois: string): string {
  const date = new Date(`${mois.slice(0, 10)}T12:00:00Z`)
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
    : mois
}
