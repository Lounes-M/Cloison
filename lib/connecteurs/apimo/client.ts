import 'server-only'
import { z } from 'zod'
import { identifiantApimo, jetonApimo } from './secret'

/**
 * Client de l'API Apimo, pour une agence et avec ses identifiants.
 *
 * Tout ce que ce code suppose du contrat d'Apimo est regroupe ici, avec son
 * niveau de preuve. La documentation publique ne se lit pas sans compte ; ce
 * qui suit vient de clients publies par des tiers et des catalogues d'Apimo.
 *
 * Recoupe par plusieurs sources :
 * - l'origine `https://api.apimo.pro` ;
 * - l'authentification HTTP Basic, identifiant du prestataire puis jeton ;
 * - `GET /agencies/{agence}/properties`, avec `limit` et `offset`, qui rend
 *   `{ total_items, properties }` ;
 * - la categorie 2 pour la location et l'etape 1 pour un bien en cours
 *   (catalogues `property_category` et `property_step`).
 *
 * A confirmer en recette, avec de vrais identifiants :
 * - les noms de champs lus sur un bien (voir `lireBien`), tous facultatifs
 *   sauf l'identifiant ;
 * - le point d'ecriture `ECRITURE`. Apimo annonce des ecritures « selon les
 *   droits » sans les decrire publiquement. Les ecritures restent fermees par
 *   `APIMO_RETOUR_STATUT` tant que ce point n'est pas confirme.
 */
const ORIGINE = 'https://api.apimo.pro'
const CATEGORIE_LOCATION = 2
const ETAPE_EN_COURS = 1
/** Type d'action « Message » du catalogue `action_type`. */
const ACTION_MESSAGE = 10
const ECRITURE = (agence: string) => `/agencies/${agence}/actions`

const PAR_PAGE = 50
const PAGES_MAX = 10
const OCTETS_MAX = 8 * 1024 * 1024
const DELAI_ECHANGE = 10_000

export type CodeApimo = 'refus' | 'limite' | 'indisponible' | 'reponse' | 'incertain'
export class ErreurApimo extends Error {
  constructor(readonly code: CodeApimo) {
    // Message constant : ni identifiant, ni jeton, ni contenu du fournisseur.
    super('Operation Apimo indisponible')
    this.name = 'ErreurApimo'
  }
}
export function codeApimo(erreur: unknown): CodeApimo {
  return erreur instanceof ErreurApimo ? erreur.code : 'indisponible'
}

export type BienApimo = {
  /** Identifiant du bien chez Apimo : des chiffres. */
  id: string
  /** Reference choisie par l'agence, si elle existe. */
  reference: string | null
  titre: string | null
  ville: string | null
  codePostal: string | null
  /** Prix affiche chez Apimo, sans savoir s'il comprend les charges. */
  loyerCents: number | null
  surface: number | null
  pieces: number | null
}

const configuration = z.strictObject({
  fournisseur: identifiantApimo,
  agenceApimo: identifiantApimo,
  jeton: jetonApimo,
  autoriserEcritures: z.boolean().default(false),
})

const objet = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const nombre = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && /^\d{1,12}(\.\d{1,4})?$/.test(v)
      ? Number(v)
      : null
const CONTROLE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]', 'g')
/** Un texte du fournisseur, borne et sans caractere de controle. */
function texte(v: unknown, max: number): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const propre = String(v).replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim()
  return propre === '' ? null : propre.slice(0, max)
}

/** Un bien du fournisseur, reduit a ce que Cloison montre. Null s'il est illisible. */
function lireBien(brut: unknown): (BienApimo & { location: boolean; enCours: boolean }) | null {
  const b = objet(brut)
  const id = b ? texte(b.id, 12) : null
  if (!b || !id || !/^[0-9]{1,12}$/.test(id)) return null
  const ville = objet(b.city)
  const prix = objet(b.price)
  const surface = nombre(objet(b.area)?.value)
  const pieces = nombre(b.rooms)
  const euros = nombre(prix?.value)
  const cents = euros === null ? null : Math.round(euros * 100)
  const commentaires = Array.isArray(b.comments) ? b.comments.map(objet) : []
  const titre =
    commentaires.find((c) => c?.language === 'fr' && texte(c.title, 80))?.title ??
    commentaires.find((c) => texte(c?.title, 80))?.title
  return {
    id,
    reference: texte(b.reference, 40),
    titre: texte(titre, 80),
    ville: texte(ville?.name, 60),
    codePostal: texte(ville?.zipcode, 10),
    loyerCents: cents !== null && cents > 0 && cents <= 10_000_000 ? cents : null,
    surface: surface !== null && surface > 0 && surface < 100_000 ? surface : null,
    pieces: pieces !== null && pieces > 0 && pieces < 1000 ? pieces : null,
    location: nombre(b.category) === CATEGORIE_LOCATION,
    // Une etape absente ne masque pas le bien : seule une autre etape l'ecarte.
    enCours: b.step === undefined || b.step === null || nombre(b.step) === ETAPE_EN_COURS,
  }
}

const page = z.object({
  total_items: z.number().int().min(0).max(1_000_000).nullish(),
  properties: z.array(z.unknown()).max(PAR_PAGE),
})

/**
 * Le libelle du logement Cloison cree depuis un bien : ce que l'agence
 * reconnait, sans rien d'une personne. 120 caracteres au plus (0069).
 */
export function libelleDuBien(bien: BienApimo): string {
  const lieu = [bien.codePostal, bien.ville].filter(Boolean).join(' ')
  const nom = bien.titre ?? `Bien ${bien.reference ?? bien.id}`
  const suffixe = bien.titre && bien.reference ? ` (${bien.reference})` : ''
  return [nom + suffixe, lieu].filter(Boolean).join(', ').slice(0, 120)
}

export type ClientApimo = ReturnType<typeof creerClientApimo>

/**
 * Aucun rejeu ici : une lecture qui echoue rend son erreur, une ecriture dont
 * l'issue est inconnue le dit (`incertain`) et l'appelant decide.
 */
export function creerClientApimo(
  identifiants: { fournisseur: string; agenceApimo: string; jeton: string },
  options: { autoriserEcritures?: boolean; transport?: typeof fetch; budget?: AbortSignal } = {},
) {
  const config = configuration.safeParse({
    fournisseur: identifiants.fournisseur,
    agenceApimo: identifiants.agenceApimo,
    jeton: identifiants.jeton,
    autoriserEcritures: options.autoriserEcritures,
  })
  if (!config.success) throw new ErreurApimo('refus')
  const { fournisseur, agenceApimo, jeton, autoriserEcritures } = config.data
  const transport = options.transport ?? fetch
  const autorisation = `Basic ${Buffer.from(`${fournisseur}:${jeton}`).toString('base64')}`

  async function requete(chemin: string, corps?: unknown): Promise<unknown> {
    const ecriture = corps !== undefined
    if (ecriture && !autoriserEcritures) throw new ErreurApimo('refus')
    const signal = AbortSignal.any([
      AbortSignal.timeout(DELAI_ECHANGE),
      ...(options.budget ? [options.budget] : []),
    ])
    if (signal.aborted) throw new ErreurApimo('indisponible')
    let reponse: Response
    try {
      reponse = await transport(`${ORIGINE}${chemin}`, {
        method: ecriture ? 'POST' : 'GET',
        headers: {
          Authorization: autorisation,
          Accept: 'application/json',
          ...(ecriture ? { 'Content-Type': 'application/json' } : {}),
        },
        body: ecriture ? JSON.stringify(corps) : undefined,
        // Jamais de redirection suivie : le jeton ne part que vers l'origine.
        redirect: 'error',
        cache: 'no-store',
        signal,
      })
    } catch {
      // La requete a pu atteindre Apimo : pour une ecriture, on ne sait pas.
      throw new ErreurApimo(ecriture ? 'incertain' : 'indisponible')
    }
    const annuler = () => void reponse.body?.cancel().catch(() => {})
    if (reponse.redirected || (reponse.status >= 300 && reponse.status < 400)) {
      annuler()
      throw new ErreurApimo('reponse')
    }
    if (reponse.status === 401 || reponse.status === 403 || reponse.status === 404) {
      annuler()
      throw new ErreurApimo('refus')
    }
    // Apimo repond 400 « Please provide the token » a un jeton absent ou mal forme.
    if (reponse.status === 400 && !ecriture) {
      annuler()
      throw new ErreurApimo('refus')
    }
    if (reponse.status === 429) {
      annuler()
      throw new ErreurApimo('limite')
    }
    if (reponse.status >= 500) {
      annuler()
      throw new ErreurApimo('indisponible')
    }
    if (reponse.status < 200 || reponse.status >= 300) {
      annuler()
      throw new ErreurApimo('reponse')
    }
    // Une ecriture acceptee n'a pas besoin de son corps : 2xx suffit.
    if (ecriture) {
      annuler()
      return null
    }
    const type = reponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    const longueur = reponse.headers.get('content-length')
    if (
      reponse.status !== 200 ||
      !reponse.body ||
      type !== 'application/json' ||
      (longueur !== null && (!/^\d+$/.test(longueur) || Number(longueur) > OCTETS_MAX))
    ) {
      annuler()
      throw new ErreurApimo('reponse')
    }
    const lecteur = reponse.body.getReader()
    const blocs: Uint8Array[] = []
    let taille = 0
    try {
      for (;;) {
        const { value, done } = await lecteur.read()
        if (signal.aborted) throw new ErreurApimo('indisponible')
        if (done) break
        taille += value.byteLength
        if (taille > OCTETS_MAX) throw new ErreurApimo('reponse')
        blocs.push(value)
      }
    } catch (erreur) {
      void lecteur.cancel().catch(() => {})
      throw erreur instanceof ErreurApimo ? erreur : new ErreurApimo('indisponible')
    }
    try {
      return JSON.parse(Buffer.concat(blocs).toString('utf8'))
    } catch {
      throw new ErreurApimo('reponse')
    }
  }

  async function lirePage(decalage: number, limite = PAR_PAGE) {
    const lu = page.safeParse(
      await requete(`/agencies/${agenceApimo}/properties?limit=${limite}&offset=${decalage}`),
    )
    if (!lu.success) throw new ErreurApimo('reponse')
    return lu.data
  }

  return {
    /**
     * Prouve que ces identifiants lisent bien cette agence : une lecture d'un
     * seul bien, dont rien n'est conserve. Leve `refus` sinon.
     */
    async verifier(): Promise<void> {
      await lirePage(0, 1)
    },

    /**
     * Les biens a louer en cours, 500 fiches parcourues au plus. `tronque`
     * dit que le parc depasse cette borne : la liste est alors partielle et
     * l'ecran l'annonce, il ne la presente jamais comme complete.
     */
    async lireBiensALouer(): Promise<{ biens: BienApimo[]; tronque: boolean }> {
      const biens = new Map<string, BienApimo>()
      let vus = 0
      let tronque = false
      for (let numero = 0; ; numero++) {
        if (numero === PAGES_MAX) {
          tronque = true
          break
        }
        const { properties, total_items } = await lirePage(numero * PAR_PAGE)
        for (const brut of properties) {
          const bien = lireBien(brut)
          // Une fiche sans identifiant lisible invalide le contrat entier.
          if (!bien) throw new ErreurApimo('reponse')
          if (!bien.location || !bien.enCours) continue
          const { location: _l, enCours: _e, ...retenu } = bien
          biens.set(retenu.id, retenu)
        }
        vus += properties.length
        if (properties.length < PAR_PAGE) break
        if (typeof total_items === 'number' && vus >= total_items) break
      }
      return { biens: [...biens.values()], tronque }
    },

    /**
     * Inscrit une ligne de suivi sur la fiche du bien. Le texte vient de
     * Cloison, jamais d'une saisie : reference du dossier et etat neutre.
     * Point d'ecriture a confirmer en recette (voir l'en-tete du module).
     */
    async ecrireSuivi(bien: string, message: string): Promise<void> {
      if (!/^[0-9]{1,12}$/.test(bien) || message.length < 1 || message.length > 300)
        throw new ErreurApimo('reponse')
      await requete(ECRITURE(agenceApimo), {
        type: ACTION_MESSAGE,
        property: Number(bien),
        comment: message,
      })
    },
  }
}
