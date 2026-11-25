/**
 * L'etape en cours du dossier, cote locataire.
 *
 * Le bandeau, la frise et « ce qu'il reste a faire » lisent tous cette
 * fonction. Aucun des trois ne redecide a partir du statut brut : un dossier
 * complet sans agence n'est pas une decision en cours, et un depot termine
 * n'attend plus les pieces du garant.
 *
 * Les gestes du locataire restent les siens : le loyer, le reglement, la
 * designation, puis le rattachement quand les pieces sont la et qu'aucune
 * agence ne suit encore le dossier. Le reste se passe chez le garant ou a
 * l'agence. Aucune etape ne parle des pieces.
 */

const STATUTS = new Set([
  'ouvert',
  'depot_en_cours',
  'complet',
  'garant_insuffisant',
  'transmis',
  'signe',
  'refuse',
  'expire',
])

export type EtapeDossier =
  | 'loyer'
  | 'paiement'
  | 'garant'
  | 'attente'
  | 'depot'
  | 'rattachement'
  | 'decision'
  | 'insuffisant'
  | 'signature'
  | 'signe'
  | 'refuse'
  | 'expire'
  | 'inconnu'

export type FaitsDossier = {
  statut: string
  loyerDeclare: boolean
  aRegler: boolean
  garantDesigne: boolean
  agence: boolean
  demonstration: boolean
}

/** Ce que le locataire peut encore faire, et l'ancre ou le faire. */
export type EtapeLocataire = 'loyer' | 'paiement' | 'garant' | 'rattachement'

/** Le message d'attente, quand il ne reste aucun geste. */
export type AttenteLocataire = 'depot' | 'decision' | 'insuffisant'

/**
 * La phrase du bandeau. `insuffisantSansAgence` et `rattachement` sont les
 * seules qui changent selon qu'une agence suit deja le dossier.
 */
export type CleExplication =
  | 'loyer'
  | 'paiement'
  | 'garant'
  | 'attente'
  | 'depot'
  | 'rattachement'
  | 'decision'
  | 'insuffisant'
  | 'insuffisantSansAgence'
  | 'signature'
  | 'signe'
  | 'refuse'
  | 'expire'
  | 'inconnu'

export function etapeDossier(faits: FaitsDossier): EtapeDossier {
  if (!STATUTS.has(faits.statut)) return 'inconnu'
  switch (faits.statut) {
    case 'expire':
      return 'expire'
    case 'refuse':
      return 'refuse'
    case 'signe':
      return 'signe'
    case 'transmis':
      return 'signature'
    case 'garant_insuffisant':
      return 'insuffisant'
    case 'complet':
      return faits.agence || faits.demonstration ? 'decision' : 'rattachement'
    case 'depot_en_cours':
      return 'depot'
    default:
      if (!faits.loyerDeclare) return 'loyer'
      if (faits.aRegler) return 'paiement'
      if (!faits.garantDesigne) return 'garant'
      return 'attente'
  }
}

function cleDe(etape: EtapeDossier, faits: FaitsDossier): CleExplication {
  if (etape === 'insuffisant') {
    return faits.agence || faits.demonstration ? 'insuffisant' : 'insuffisantSansAgence'
  }
  return etape
}

function gestesDe(etape: EtapeDossier, faits: FaitsDossier): EtapeLocataire[] {
  if (etape === 'loyer') {
    const gestes: EtapeLocataire[] = ['loyer']
    if (faits.aRegler) gestes.push('paiement')
    else if (!faits.garantDesigne) gestes.push('garant')
    return gestes
  }
  if (etape === 'paiement') return ['paiement']
  if (etape === 'garant') return ['garant']
  if (etape === 'rattachement') return ['rattachement']
  return []
}

function attenteDe(etape: EtapeDossier): AttenteLocataire | null {
  if (etape === 'attente' || etape === 'depot') return 'depot'
  if (etape === 'decision') return 'decision'
  if (etape === 'insuffisant') return 'insuffisant'
  return null
}

/** L'etape, la phrase du bandeau, les gestes et l'attente : une seule lecture. */
export function suiviLocataire(faits: FaitsDossier): {
  etape: EtapeDossier
  cle: CleExplication
  gestes: EtapeLocataire[]
  attente: AttenteLocataire | null
} {
  const etape = etapeDossier(faits)
  return {
    etape,
    cle: cleDe(etape, faits),
    gestes: gestesDe(etape, faits),
    attente: attenteDe(etape),
  }
}

/** Les gestes d'un dossier encore `ouvert`, dans l'ordre ou il en a besoin. */
export function resteAFaireLocataire(faits: {
  loyerDeclare: boolean
  aRegler: boolean
  garantDesigne: boolean
}): EtapeLocataire[] {
  return suiviLocataire({
    statut: 'ouvert',
    agence: false,
    demonstration: false,
    ...faits,
  }).gestes
}

/** Le bandeau d'un dossier `ouvert`, a partir des memes faits que la liste. */
export type DetailOuvert = 'loyer' | 'paiement' | 'garant' | 'attente'

export function detailDossierOuvert(faits: {
  loyerDeclare: boolean
  aRegler: boolean
  garantDesigne: boolean
}): DetailOuvert {
  const etape = suiviLocataire({
    statut: 'ouvert',
    agence: false,
    demonstration: false,
    ...faits,
  }).etape
  if (etape === 'loyer' || etape === 'paiement' || etape === 'garant') return etape
  return 'attente'
}
