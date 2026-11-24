import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Un faux Apimo, sur un vrai port local.
 *
 * Il parle HTTP pour de bon : en-tetes, corps, codes de reponse et coupures
 * passent par la pile reseau de Node, pas par un double de `fetch`. Il tient
 * le contrat que le client suppose (voir lib/connecteurs/apimo/client.ts) :
 * Basic, `/agencies/{id}/properties` pagine, `/agencies/{id}/actions`.
 *
 * Ce n'est pas Apimo. Il prouve que le client fait ce qu'il dit, pas que le
 * contrat suppose est le bon : cela, seule une recette avec de vrais
 * identifiants le dira.
 */
export type FauxApimo = {
  /** Remplace `fetch` : memes requetes, origine officielle reecrite en local. */
  transport: typeof fetch
  /** Les requetes recues, dans l'ordre. */
  recues: { methode: string; chemin: string; autorisation: string | null; corps: unknown }[]
  /** Les origines que le client a reellement demandees. */
  origines: string[]
  biens: unknown[]
  /** Programme la prochaine reponse, une seule fois. */
  prochaine: (reponse: Reprogrammee) => void
  fermer: () => Promise<void>
}
type Reprogrammee =
  | { statut: number; corps?: string; type?: string; entetes?: Record<string, string> }
  | { coupure: true }
  | { silence: true }

export const FAUX_IDENTIFIANTS = {
  fournisseur: '4242',
  agenceApimo: '777',
  jeton: 'jeton-fictif-0123456789',
}

async function lireCorps(requete: IncomingMessage) {
  const blocs: Buffer[] = []
  for await (const bloc of requete) blocs.push(bloc as Buffer)
  const brut = Buffer.concat(blocs).toString('utf8')
  try {
    return brut ? JSON.parse(brut) : null
  } catch {
    return brut
  }
}

export async function demarrerFauxApimo(biens: unknown[] = []): Promise<FauxApimo> {
  // Le vrai `fetch`, saisi avant qu'un essai ne le remplace par ce transport.
  const vraiFetch = globalThis.fetch
  const attendu = `Basic ${Buffer.from(
    `${FAUX_IDENTIFIANTS.fournisseur}:${FAUX_IDENTIFIANTS.jeton}`,
  ).toString('base64')}`
  const file: Reprogrammee[] = []
  const faux: Omit<FauxApimo, 'transport' | 'fermer'> = {
    recues: [],
    origines: [],
    biens,
    prochaine: (r) => void file.push(r),
  }
  const serveur: Server = createServer(async (requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://faux')
    const autorisation = requete.headers.authorization ?? null
    faux.recues.push({
      methode: requete.method ?? '',
      chemin: url.pathname + url.search,
      autorisation,
      corps: await lireCorps(requete),
    })
    const json = (statut: number, corps: unknown) => {
      reponse.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' })
      reponse.end(JSON.stringify(corps))
    }
    const programmee = file.shift()
    if (programmee && 'coupure' in programmee) return void requete.socket.destroy()
    if (programmee && 'silence' in programmee) return
    if (programmee) {
      reponse.writeHead(programmee.statut, {
        'Content-Type': programmee.type ?? 'application/json',
        ...programmee.entetes,
      })
      return void reponse.end(programmee.corps ?? '{}')
    }
    if (!autorisation)
      return json(400, { status: 400, title: 'Bad Request', detail: 'Please provide the token' })
    if (autorisation !== attendu) return json(401, { status: 401, title: 'Unauthorized' })
    const biensDe = url.pathname.match(/^\/agencies\/(\d+)\/properties$/)
    const actionsDe = url.pathname.match(/^\/agencies\/(\d+)\/actions$/)
    const agence = (biensDe ?? actionsDe)?.[1]
    if (agence && agence !== FAUX_IDENTIFIANTS.agenceApimo)
      return json(403, { status: 403, title: 'Forbidden' })
    if (biensDe && requete.method === 'GET') {
      const limite = Number(url.searchParams.get('limit') ?? 100)
      const decalage = Number(url.searchParams.get('offset') ?? 0)
      return json(200, {
        total_items: faux.biens.length,
        timestamp: 1790000000,
        properties: faux.biens.slice(decalage, decalage + limite),
      })
    }
    if (actionsDe && requete.method === 'POST') return json(201, { id: 1 })
    return json(404, { status: 404, title: 'Not Found' })
  })
  await new Promise<void>((pret) => serveur.listen(0, '127.0.0.1', pret))
  const port = (serveur.address() as AddressInfo).port
  return {
    ...faux,
    get biens() {
      return faux.biens
    },
    set biens(valeur: unknown[]) {
      faux.biens = valeur
    },
    transport: (entree, options) => {
      const url = new URL(String(entree))
      faux.origines.push(url.origin)
      return vraiFetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, options)
    },
    fermer: () =>
      new Promise<void>((fini) => {
        serveur.closeAllConnections()
        serveur.close(() => fini())
      }),
  }
}

/** Une fiche telle que les clients publies la decrivent. */
export function bienFictif(id: number, changement: Record<string, unknown> = {}) {
  return {
    id,
    reference: `LOC-${id}`,
    agency: 777,
    category: 2,
    step: 1,
    status: 1,
    type: 1,
    address: '1 rue Fictive',
    city: { id: 30000, name: 'Lyon', zipcode: '69004' },
    price: { value: 850, currency: 'EUR' },
    area: { value: 42.5, unit: 1 },
    rooms: 2,
    bedrooms: 1,
    comments: [
      { language: 'en', title: 'Two-room flat', comment: 'Bright.' },
      { language: 'fr', title: 'T2 Croix-Rousse', comment: 'Lumineux.' },
    ],
    pictures: [{ id: 1, url: 'https://exemple.invalid/1.jpg', rank: 1 }],
    updated_at: '2026-11-01 10:00:00',
    ...changement,
  }
}
