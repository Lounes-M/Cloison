import { TAILLE_MAX_DEPOT } from '@/lib/garant/validation'

/**
 * Reunit plusieurs photos en un seul PDF, dans le navigateur, sans rien envoyer.
 *
 * Un avis d'imposition fait quatre pages, trois bulletins de paie font trois
 * photos, et le coffre attend un fichier par piece. Sur un telephone, personne
 * n'a d'outil pour les assembler : la page le fait ici, avant l'envoi, et le
 * serveur recoit un PDF ordinaire qu'il verifie et chiffre comme les autres
 * (ADR 0003).
 *
 * Chaque photo est redessinee en JPEG : c'est ce qui applique l'orientation
 * notee par l'appareil, que le PDF ignorerait, et ce qui permet de tenir sous
 * la borne de depot en baissant la definition par paliers.
 *
 * Le PDF est ecrit a la main plutot qu'avec une bibliotheque : une page par
 * photo, une image JPEG par page, rien d'autre. Cela tient en quelques lignes
 * et evite de faire telecharger un editeur de PDF a un telephone.
 */

/** Au-dela, c'est un document a deposer en PDF, pas une suite de photos. */
export const PAGES_MAX = 12

/** La borne de depot, moins l'enveloppe du formulaire et celle du PDF. */
const BUDGET = TAILLE_MAX_DEPOT - 96 * 1024

/**
 * Du plus fin au plus leger. Le dernier palier se lit encore sans effort pour
 * une page de texte photographiee ; en dessous, on prefere refuser.
 */
const PALIERS: readonly (readonly [cote: number, qualite: number])[] = [
  [2000, 0.85],
  [1700, 0.8],
  [1450, 0.72],
  [1200, 0.62],
]

/** Une page A4 en points : la photo y est ajustee sans etre deformee. */
const A4 = [595, 842] as const

export type PageJpeg = { octets: Uint8Array<ArrayBuffer>; largeur: number; hauteur: number }

export type Reunion =
  { ok: true; fichier: File } | { ok: false; raison: 'illisible' | 'trop_lourd' | 'trop_de_pages' }

export function estPhoto(fichier: File) {
  return fichier.type === 'image/jpeg' || fichier.type === 'image/png'
}

/** Redessine une image en JPEG, bornee a `cote` pixels. Leve si elle ne se lit pas. */
async function pageDepuis(source: Blob, cote: number, qualite: number): Promise<PageJpeg> {
  const image = await createImageBitmap(source)
  try {
    const echelle = Math.min(1, cote / Math.max(image.width, image.height))
    const toile = document.createElement('canvas')
    toile.width = Math.max(1, Math.round(image.width * echelle))
    toile.height = Math.max(1, Math.round(image.height * echelle))
    const contexte = toile.getContext('2d')
    if (!contexte) throw new Error('moteur 2D indisponible')
    // Le JPEG ne conserve pas la transparence : fond blanc, comme le papier.
    contexte.fillStyle = '#fff'
    contexte.fillRect(0, 0, toile.width, toile.height)
    contexte.drawImage(image, 0, 0, toile.width, toile.height)
    const blob = await new Promise<Blob | null>((resoudre) =>
      toile.toBlob(resoudre, 'image/jpeg', qualite),
    )
    // Liberer la toile tout de suite : Safari sur iOS plafonne leur memoire totale.
    const [largeur, hauteur] = [toile.width, toile.height]
    toile.width = toile.height = 0
    if (!blob || blob.size === 0) throw new Error('encodage impossible')
    return { octets: new Uint8Array(await blob.arrayBuffer()), largeur, hauteur }
  } finally {
    image.close()
  }
}

/**
 * Les pages deja preparees au premier palier, par photo choisie. Ajouter une
 * cinquieme page ne redecode pas les quatre premieres, et la cle faible rend
 * la memoire des qu'une photo est retiree.
 */
const preparees = new WeakMap<File, PageJpeg>()

async function premierPalier(photo: File): Promise<PageJpeg> {
  const connue = preparees.get(photo)
  if (connue) return connue
  const page = await pageDepuis(photo, ...PALIERS[0]!)
  preparees.set(photo, page)
  return page
}

const poids = (pages: readonly PageJpeg[]) =>
  pages.reduce((total, page) => total + page.octets.length, 0)

/**
 * Un PDF d'une image JPEG par page, sans dependance.
 *
 * Deux objets de structure, puis trois par page : la page, son contenu
 * (une seule instruction qui dessine l'image) et l'image elle-meme, dont les
 * octets JPEG sont repris tels quels sous le filtre DCTDecode.
 */
export function assemblerPdf(pages: readonly PageJpeg[]): Uint8Array<ArrayBuffer> {
  const morceaux: Uint8Array[] = []
  const positions: number[] = []
  let longueur = 0
  const ecrire = (morceau: string | Uint8Array) => {
    const octets = typeof morceau === 'string' ? new TextEncoder().encode(morceau) : morceau
    morceaux.push(octets)
    longueur += octets.length
  }
  const objet = (numero: number, corps: string, flux?: Uint8Array) => {
    positions[numero] = longueur
    ecrire(`${numero} 0 obj\n${corps}\n`)
    if (flux) {
      ecrire('stream\n')
      ecrire(flux)
      ecrire('\nendstream\n')
    }
    ecrire('endobj\n')
  }
  const nombre = (valeur: number) => String(Math.round(valeur * 100) / 100)

  // L'en-tete, et quatre octets hauts qui disent aux outils que le fichier est binaire.
  ecrire('%PDF-1.4\n')
  ecrire(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  const numeroPage = (indice: number) => 3 + indice * 3
  objet(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objet(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages
      .map((_, indice) => `${numeroPage(indice)} 0 R`)
      .join(' ')}] >>`,
  )

  pages.forEach((page, indice) => {
    const [numero, contenu, image] = [
      numeroPage(indice),
      numeroPage(indice) + 1,
      numeroPage(indice) + 2,
    ]
    // La page prend le sens de la photo, et la photo la remplit sans deformation.
    const [large, haut] = page.largeur > page.hauteur ? [A4[1], A4[0]] : A4
    const echelle = Math.min(large / page.largeur, haut / page.hauteur)
    const [l, h] = [page.largeur * echelle, page.hauteur * echelle]
    const dessin = new TextEncoder().encode(`q ${nombre(l)} 0 0 ${nombre(h)} 0 0 cm /Im0 Do Q`)
    objet(
      numero,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nombre(l)} ${nombre(h)}] ` +
        `/Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${contenu} 0 R >>`,
    )
    objet(contenu, `<< /Length ${dessin.length} >>`, dessin)
    objet(
      image,
      `<< /Type /XObject /Subtype /Image /Width ${page.largeur} /Height ${page.hauteur} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${page.octets.length} >>`,
      page.octets,
    )
  })

  const total = 3 + pages.length * 3
  const debutTable = longueur
  ecrire(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let numero = 1; numero < total; numero += 1)
    ecrire(`${String(positions[numero]).padStart(10, '0')} 00000 n \n`)
  ecrire(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${debutTable}\n%%EOF\n`)

  const pdf = new Uint8Array(longueur)
  let curseur = 0
  for (const morceau of morceaux) {
    pdf.set(morceau, curseur)
    curseur += morceau.length
  }
  return pdf
}

/**
 * Les photos, dans l'ordre choisi, en un seul PDF sous la borne de depot.
 *
 * Si le premier palier pese trop, les pages deja reduites sont reprises a un
 * palier plus leger : on repart de leur JPEG de deux mille pixels, pas de la
 * photo d'origine, ce qui reste rapide sur un telephone.
 */
export async function reunirPhotos(photos: readonly File[]): Promise<Reunion> {
  if (photos.length > PAGES_MAX) return { ok: false, raison: 'trop_de_pages' }

  let pages: PageJpeg[]
  try {
    pages = []
    // Une a la fois : decoder douze photos de front epuise la memoire d'un telephone.
    for (const photo of photos) pages.push(await premierPalier(photo))
    for (const [cote, qualite] of PALIERS.slice(1)) {
      if (poids(pages) <= BUDGET) break
      const allegees: PageJpeg[] = []
      for (const photo of photos) {
        const page = await premierPalier(photo)
        allegees.push(
          await pageDepuis(new Blob([page.octets], { type: 'image/jpeg' }), cote, qualite),
        )
      }
      pages = allegees
    }
  } catch {
    return { ok: false, raison: 'illisible' }
  }
  if (poids(pages) > BUDGET) return { ok: false, raison: 'trop_lourd' }

  return {
    ok: true,
    fichier: new File([assemblerPdf(pages)], 'pages-reunies.pdf', { type: 'application/pdf' }),
  }
}
