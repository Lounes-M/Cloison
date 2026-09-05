import 'server-only'
import { spawn } from 'node:child_process'

/** Limites par instance serveur. Aucun document n'attend dans une file en memoire. */
let actifs = 0
const CONCURRENCE_MAX = 2
export async function executerProcessus(
  script: string,
  entree: Buffer,
  { delai = 15_000, sortieMax = 30 * 1024 * 1024 } = {},
): Promise<Buffer> {
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
      const arreter = (message: string) => {
        erreur ??= new Error(message)
        enfant.kill('SIGKILL')
      }
      const minuteur = setTimeout(() => arreter('Document trop long a traiter'), delai)
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
      // close suit la fin du processus ET des flux : le slot n'est pas libere
      // des l'envoi du signal, sinon un processus bloque pourrait s'accumuler.
      enfant.on('close', (code) => {
        clearTimeout(minuteur)
        if (erreur || code !== 0) reject(erreur ?? new Error('Document refuse par le moteur'))
        else resolve(Buffer.concat(blocs, octets))
      })
      enfant.stdin.end(entree)
    })
  } finally {
    actifs--
  }
}
