/**
 * La mention de l'article 2297, et ce qu'on en verifie.
 *
 * On guide sans pre-remplir : l'ADR 0005 le pose comme la consequence produit
 * la plus importante du droit des suretes. Un champ pre-rempli, ou meme
 * pre-suggere d'un peu trop pres, ferait tomber l'engagement. Ce module ne
 * contient donc aucune phrase modele. Il sait lire ce que le garant a ecrit,
 * et dire ce qui manque.
 *
 * Quatre elements, a peine de nullite :
 *
 *   1. s'engager en qualite de caution ;
 *   2. payer le creancier en cas de defaillance du debiteur ;
 *   3. un montant maximal, en chiffres ET en toutes lettres, qui concordent ;
 *   4. si l'engagement est solidaire, renoncer aux benefices de discussion
 *      et de division.
 *
 * Pur : ni base, ni environnement. Tout se teste.
 */

const UNITES = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
]

const DIZAINES = [
  '',
  'dix',
  'vingt',
  'trente',
  'quarante',
  'cinquante',
  'soixante',
  'soixante',
  'quatre-vingt',
  'quatre-vingt',
]

function moinsDeCent(n: number): string {
  if (n < 17) return UNITES[n]!
  if (n < 20) return `dix-${UNITES[n - 10]}`

  const dizaine = Math.floor(n / 10)
  const unite = n % 10

  // Soixante-dix et quatre-vingt-dix comptent en base vingt.
  if (dizaine === 7 || dizaine === 9) {
    const reste = n - (dizaine - 1) * 10
    const liaison = dizaine === 7 && reste === 11 ? '-et-' : '-'
    return `${DIZAINES[dizaine - 1]}${liaison}${moinsDeCent(reste)}`
  }

  if (unite === 0) return dizaine === 8 ? 'quatre-vingts' : DIZAINES[dizaine]!
  if (unite === 1 && dizaine !== 8) return `${DIZAINES[dizaine]}-et-un`
  return `${DIZAINES[dizaine]}-${UNITES[unite]}`
}

function moinsDeMille(n: number): string {
  if (n < 100) return moinsDeCent(n)
  const centaines = Math.floor(n / 100)
  const reste = n % 100
  const cent = centaines === 1 ? 'cent' : `${UNITES[centaines]}-cent`
  if (reste === 0) return centaines === 1 ? 'cent' : `${cent}s`
  return `${cent}-${moinsDeCent(reste)}`
}

/**
 * Un entier en lettres, orthographe de 1990 (traits d'union partout).
 *
 * Sert de reference pour verifier ce que le garant a ecrit, pas pour le lui
 * proposer. Jusqu'a 999 999 999 : au-dela, ce n'est pas un loyer.
 */
export function nombreEnLettres(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) {
    throw new Error(`Nombre hors de portee : ${n}`)
  }
  if (n === 0) return 'zéro'

  const millions = Math.floor(n / 1_000_000)
  const milliers = Math.floor((n % 1_000_000) / 1000)
  const reste = n % 1000
  const parties: string[] = []

  if (millions > 0) parties.push(`${moinsDeMille(millions)}-million${millions > 1 ? 's' : ''}`)
  if (milliers > 0) parties.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers)}-mille`)
  if (reste > 0) parties.push(moinsDeMille(reste))

  return parties.join('-')
}

/**
 * Deux ecritures d'un meme nombre doivent se reconnaitre malgre l'orthographe.
 *
 * « quatre vingt dix », « quatre-vingt-dix », « QUATRE-VINGTS-DIX » et
 * « quatre vingts dix » designent tous le meme nombre. On compare sans
 * accents, sans traits d'union, sans les `s` de « vingts » et « cents », et
 * sans les « et » : ce qui reste est la suite des mots-nombres.
 */
export function normaliserLettres(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-‑ \s]+/g, ' ')
    .split(' ')
    .filter((mot) => mot !== '' && mot !== 'et')
    .map((mot) => (mot === 'vingts' ? 'vingt' : mot === 'cents' ? 'cent' : mot))
    .join(' ')
}

/**
 * Les montants en chiffres, en euros avec au plus deux decimales.
 *
 * « 12 000 », « 12000 », « 12 000,00 €», « 12.000 » : quatre facons d'ecrire
 * le meme montant. Un jeton numerique mal forme est refuse en entier : jamais
 * recuperer « 50 » a la fin de « 12000,50 ».
 */
export function montantsEnChiffres(texte: string): number[] {
  const trouves = new Set<number>()
  const motif = /[+-]?\d(?:[\d   ]|[.,](?=\d))*\s*(?:€|euros?\b|eur\b)/gi

  for (const correspondance of texte.matchAll(motif)) {
    const nombre = correspondance[0].replace(/(?:€|euros?|eur)$/i, '').trim()
    const parties = /^(\d{1,3}(?:[   .]\d{3})+|\d+)(?:[,.](\d{1,2}))?$/.exec(nombre)
    if (!parties) continue
    const cents =
      Number(parties[1]!.replace(/[   .]/g, '')) * 100 + Number((parties[2] ?? '').padEnd(2, '0'))
    if (Number.isSafeInteger(cents) && cents > 0 && cents <= 999_999_999 * 100)
      trouves.add(cents / 100)
  }

  return [...trouves]
}

export type Element = 'caution' | 'paiement' | 'montant' | 'solidarite'

export type Verdict = { ok: true; montantEuros: number } | { ok: false; manques: Element[] }

const CONTIENT = (texte: string, ...termes: string[]) => {
  const plat = normaliserLettres(texte)
  return termes.every((terme) => plat.includes(terme))
}

/**
 * Ce que la mention contient, et ce qui lui manque.
 *
 * Le montant est valide quand un chiffre du texte se retrouve, en lettres,
 * dans le meme texte. En cas de divergence, la loi fait primer les lettres ;
 * ici on exige simplement qu'elles concordent, puisque le garant est encore
 * la pour corriger.
 */
export function verifierMention(texte: string, solidaire: boolean): Verdict {
  const manques: Element[] = []
  // Reperage indicatif, jamais une validation juridique ou semantique complete.
  // La negation dans la condition de defaillance ne nie pas l'engagement.
  const plat = normaliserLettres(texte).replace(
    /\b(?:si|lorsque|quand) (?:le|mon|ce) (?:locataire|debiteur) ne (?:paie|paye|regle) pas\b/g,
    'defaillance',
  )

  const negation = /\b(?:ne|pas|jamais|refuse)\b/.test(plat)
  if (!plat.includes('caution') || negation) manques.push('caution')

  // Payer, et en cas de defaillance : les deux idees, pas une formule.
  const paie = /\bpa(?:yer|ie|ierai|iera|yerai)\b/.test(plat) || plat.includes('regler')
  const defaut = plat.includes('defaillance') || plat.includes('defaut') || plat.includes('impaye')
  if (!paie || !defaut || negation) manques.push('paiement')

  let montantEuros: number | null = null
  const chiffres = montantsEnChiffres(texte)
  for (const chiffre of chiffres.length === 1 ? chiffres : []) {
    const cents = Math.round(chiffre * 100)
    const mots = normaliserLettres(nombreEnLettres(Math.floor(cents / 100)))
    const centimes = cents % 100
    const suffixe = centimes ? ` ${normaliserLettres(nombreEnLettres(centimes))} centimes?\\b` : ''
    if (new RegExp(`(?:^|[^a-z])${mots} euros?\\b${suffixe}`).test(plat)) {
      montantEuros = chiffre
      break
    }
  }
  if (montantEuros === null) manques.push('montant')

  if (solidaire) {
    const renonce = CONTIENT(texte, 'renonc', 'discussion', 'division')
    const dit = plat.includes('solidaire')
    if (!renonce || !dit) manques.push('solidarite')
  }

  return manques.length === 0 && montantEuros !== null
    ? { ok: true, montantEuros }
    : { ok: false, manques }
}
