import 'server-only'
import { z } from 'zod'
import { fetchBorne } from '@/lib/http/fetch-borne'

/**
 * Lecture des biens a louer d'une agence chez Apimo.
 *
 * Etat de ce module : ecrit d'apres la description publique de l'API
 * (prestataire identifie par un couple identifiant et jeton, biens ranges par
 * agence), sans identifiants reels. Les noms de champs et les codes ci-dessous
 * sont a confirmer lors de la recette avec Apimo ; ils sont regroupes ici pour
 * qu'une correction ne touche que ce fichier. Tant que `APIMO_PROVIDER` et
 * `APIMO_TOKEN` sont absents, rien n'est appele et rien n'est affiche.
 *
 * Le module ne lit que des biens. Il n'ecrit rien chez l'editeur, ne suit
 * aucune redirection et n'appelle que l'hote ci-dessous : l'identifiant de
 * l'agence est un nombre, jamais une adresse.
 */

const HOTE = 'https://api.apimo.pro'
/** Categorie « location » du referentiel Apimo. A confirmer en recette. */
const CATEGORIE_LOCATION = 2
const PAR_PAGE = 100
const PAGES_MAX = 5
const OCTETS_MAX = 2 * 1024 * 1024
/** Ce que l'import inscrit en une fois (voir `importer_logements`, 0089). */
export const BIENS_MAX = 200

export type BienImporte = {
  reference: string
  libelle: string
  loyer_cents: number | null
  ville: string | null
  surface_m2: number | null
  pieces: number | null
  meuble: boolean | null
  disponible_le: string | null
}

export type LectureApimo =
  | { etat: 'ok'; biens: BienImporte[]; ignores: number }
  | {
      etat:
        | 'non_configure'
        | 'refuse'
        | 'limite'
        | 'indisponible'
        | 'reponse_invalide'
        | 'trop_de_biens'
    }

export function apimoConfigure(): boolean {
  return Boolean(process.env.APIMO_PROVIDER?.trim() && process.env.APIMO_TOKEN?.trim())
}

const nombre = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)]).transform(Number)
const facultatif = <T extends z.ZodType>(schema: T) => schema.nullish().catch(null)

/** Tolerant : un champ inattendu ou mal forme vaut absence, pas echec. */
const bien = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^[0-9]{1,18}$/)]).transform(String),
  reference: facultatif(z.union([z.string(), z.number()]).transform(String)),
  category: facultatif(nombre),
  rooms: facultatif(nombre),
  available_at: facultatif(z.string()),
  city: facultatif(z.object({ name: facultatif(z.string()) })),
  area: facultatif(z.object({ value: facultatif(nombre) })),
  price: facultatif(z.object({ value: facultatif(nombre), currency: facultatif(z.string()) })),
  comments: facultatif(
    z.array(z.object({ language: facultatif(z.string()), title: facultatif(z.string()) })),
  ),
})
const page = z.object({
  total_items: facultatif(nombre),
  properties: z.array(z.unknown()).max(PAR_PAGE),
})

const propre = (texte: string) => texte.replace(/\s+/g, ' ').trim()
const borne = (n: number | null | undefined, min: number, max: number) =>
  n != null && Number.isFinite(n) && n >= min && n <= max ? n : null

/** Un bien Apimo devient un logement Cloison, ou rien s'il n'est pas a louer. */
export function versLogement(brut: unknown): BienImporte | null {
  const lu = bien.safeParse(brut)
  if (!lu.success || lu.data.category !== CATEGORIE_LOCATION) return null
  const b = lu.data
  const ville = b.city?.name ? propre(b.city.name).slice(0, 80) || null : null
  const piecesBrut = borne(b.rooms, 1, 20)
  const pieces = piecesBrut === null ? null : Math.round(piecesBrut)
  const surfaceBrut = borne(b.area?.value, 5, 1000)
  const surface = surfaceBrut === null ? null : Math.round(surfaceBrut)
  const euros = !b.price?.currency || b.price.currency.toUpperCase() === 'EUR'
  const loyerBrut = euros ? borne(b.price?.value, 0.01, 100000) : null
  const titre = b.comments?.find((c) => c.language === 'fr' && c.title)?.title
  const reference = b.reference ? propre(b.reference) : ''
  const compose = [
    pieces ? `${pieces} pièce${pieces > 1 ? 's' : ''}` : 'Bien',
    ville,
    reference ? `(réf. ${reference})` : null,
  ]
    .filter(Boolean)
    .join(' ')
  const libelle = propre(titre ?? '').slice(0, 120) || compose.slice(0, 120)
  const date = b.available_at?.slice(0, 10) ?? ''
  return {
    reference: b.id,
    libelle,
    loyer_cents: loyerBrut === null ? null : Math.round(loyerBrut * 100),
    ville,
    surface_m2: surface,
    pieces,
    // L'ameublement depend d'un referentiel non confirme : jamais devine.
    meuble: null,
    disponible_le:
      /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : null,
  }
}

async function corpsBorne(reponse: Response): Promise<unknown> {
  if (Number(reponse.headers.get('content-length') ?? 0) > OCTETS_MAX) throw new Error('volume')
  const lecteur = reponse.body?.getReader()
  if (!lecteur) throw new Error('corps')
  const morceaux: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    total += value.byteLength
    if (total > OCTETS_MAX) {
      await lecteur.cancel()
      throw new Error('volume')
    }
    morceaux.push(value)
  }
  return JSON.parse(Buffer.concat(morceaux).toString('utf8'))
}

/**
 * Tous les biens a louer de l'agence, ou un etat d'echec sans detail.
 * Aucun rejeu : une page en echec interrompt la lecture, sans liste partielle.
 */
export async function lireLocationsApimo(
  identifiant: string,
  { requete = fetchBorne, signal }: { requete?: typeof fetchBorne; signal?: AbortSignal } = {},
): Promise<LectureApimo> {
  const fournisseur = process.env.APIMO_PROVIDER?.trim()
  const jeton = process.env.APIMO_TOKEN?.trim()
  if (!fournisseur || !jeton) return { etat: 'non_configure' }
  if (!/^[0-9]{1,10}$/.test(identifiant)) return { etat: 'refuse' }
  const autorisation = `Basic ${Buffer.from(`${fournisseur}:${jeton}`).toString('base64')}`
  const budget = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])])
  const biens: BienImporte[] = []
  let ignores = 0
  let lus = 0
  try {
    for (let n = 0; n < PAGES_MAX; n++) {
      const adresse = new URL(`/agencies/${identifiant}/properties`, HOTE)
      adresse.searchParams.set('limit', String(PAR_PAGE))
      adresse.searchParams.set('offset', String(n * PAR_PAGE))
      const reponse = await requete(
        adresse,
        {
          headers: { Authorization: autorisation, Accept: 'application/json' },
          redirect: 'error',
          cache: 'no-store',
        },
        budget,
      )
      if (reponse.status === 401 || reponse.status === 403 || reponse.status === 404)
        return { etat: 'refuse' }
      if (reponse.status === 429) return { etat: 'limite' }
      if (!reponse.ok) return { etat: 'indisponible' }
      const lue = page.safeParse(await corpsBorne(reponse))
      if (!lue.success) return { etat: 'reponse_invalide' }
      for (const brut of lue.data.properties) {
        const logement = versLogement(brut)
        if (logement) biens.push(logement)
        else ignores++
      }
      lus += lue.data.properties.length
      if (biens.length > BIENS_MAX) return { etat: 'trop_de_biens' }
      const total = lue.data.total_items
      if (lue.data.properties.length < PAR_PAGE || (total != null && lus >= total))
        return { etat: 'ok', biens, ignores }
    }
    // Encore des pages au-dela de la borne : aucun import tronque.
    return { etat: 'trop_de_biens' }
  } catch (erreur) {
    if (erreur instanceof SyntaxError) return { etat: 'reponse_invalide' }
    return { etat: 'indisponible' }
  }
}
