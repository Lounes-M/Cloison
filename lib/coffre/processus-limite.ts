import 'server-only'
import { spawn, type ChildProcess } from 'node:child_process'
import { lireMemoireProcessus } from './memoire-processus'

/** Limites par instance serveur. Aucun document n'attend dans une file en memoire. */
let actifs = 0
const CONCURRENCE_MAX = 2
const MEMOIRE_MAX = 384 * 1024 * 1024
const MEMOIRE_CUMULEE_MAX = 512 * 1024 * 1024
const memoires = new Map<ChildProcess, number>()
export async function executerProcessus(
  script: string,
  entree: Buffer,
  {
    delai = 15_000,
    sortieMax = 30 * 1024 * 1024,
    memoireMax = MEMOIRE_MAX,
  }: {
    delai?: number
    sortieMax?: number
    memoireMax?: number
  } = {},
): Promise<Buffer> {
  if (!Number.isSafeInteger(memoireMax) || memoireMax <= 0 || memoireMax > MEMOIRE_MAX)
    throw new Error('Limite memoire invalide')
  if (entree.length > 30 * 1024 * 1024) throw new Error('Entree trop volumineuse')
  if (actifs >= CONCURRENCE_MAX) throw new Error('Traitement occupe, reessaie dans un instant')
  actifs++
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const enfant = spawn(process.execPath, ['--max-old-space-size=128', script], {
        // Aucun secret applicatif, NODE_OPTIONS ou fichier temporaire en clair.
        env: { LANG: 'C.UTF-8', TZ: 'UTC', NODE_ENV: 'production' },
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      })
      const blocs: Buffer[] = []
      let octets = 0
      let erreur: Error | null = null
      let termine = false
      let mesureEnCours = false
      const arreter = (message: string) => {
        erreur ??= new Error(message)
        enfant.kill('SIGKILL')
      }
      const minuteur = setTimeout(() => arreter('Document trop long a traiter'), delai)
      const mesurer = async () => {
        if (termine || erreur || mesureEnCours || !enfant.pid) return
        mesureEnCours = true
        try {
          const rss = await lireMemoireProcessus(enfant.pid)
          if (termine || rss === null) return
          memoires.set(enfant, rss)
          if (rss > memoireMax) arreter('Memoire documentaire excessive')
          else if (
            [...memoires.values()].reduce((somme, valeur) => somme + valeur, 0) >
            MEMOIRE_CUMULEE_MAX
          )
            arreter('Budget memoire documentaire depasse')
        } catch {
          if (!termine) arreter('Mesure memoire indisponible')
        } finally {
          mesureEnCours = false
        }
      }
      // Echantillonnage, pas plafond OS : un pic entre deux lectures peut depasser.
      const surveillance =
        process.platform === 'linux' ? setInterval(() => void mesurer(), 50) : null
      if (surveillance) memoires.set(enfant, 0)
      enfant.stdout.on('data', (bloc: Buffer) => {
        octets += bloc.length
        if (octets > sortieMax) arreter('Sortie trop volumineuse')
        else if (!erreur) blocs.push(bloc)
      })
      enfant.on('error', () => {
        erreur ??= new Error('Moteur documentaire indisponible')
      })
      enfant.stdin.on('error', () => {
        erreur ??= new Error('Traitement documentaire interrompu')
      })
      enfant.on('exit', () => {
        termine = true
      })
      // close suit la fin du processus ET des flux : le slot n'est pas libere
      // des l'envoi du signal, sinon un processus bloque pourrait s'accumuler.
      enfant.on('close', (code) => {
        termine = true
        clearTimeout(minuteur)
        if (surveillance) clearInterval(surveillance)
        memoires.delete(enfant)
        if (erreur || code !== 0) reject(erreur ?? new Error('Document refuse par le moteur'))
        else resolve(Buffer.concat(blocs, octets))
      })
      if (surveillance) {
        // Verifier la mesure avant de transmettre le document.
        void mesurer().then(() => {
          if (!erreur && !termine) enfant.stdin.end(entree)
        })
      } else enfant.stdin.end(entree)
    })
  } finally {
    actifs--
  }
}
