import 'server-only'
import { readFile } from 'node:fs/promises'

/** Mesure Linux du processus enfant, sans cooperation du decodeur. */
export async function lireMemoireProcessus(pid: number): Promise<number | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Mesure memoire indisponible')
  // /proc peut etre lu pendant l'initialisation ou la liberation de mm.
  // Une seule relecture : aucun processus vivant sans mesure n'est accepte.
  for (let essai = 0; essai < 2; essai++) {
    let statut: string
    try {
      statut = await readFile(`/proc/${pid}/status`, 'utf8')
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Mesure memoire indisponible')
      try {
        process.kill(pid, 0)
      } catch (absence) {
        if ((absence as NodeJS.ErrnoException).code === 'ESRCH') return null
      }
      continue
    }
    // Un processus termine n'a plus de memoire residente ; le slot attend close.
    if (/^State:\s+[ZX]\b/m.test(statut)) return null
    const mesure = /^VmRSS:\s+(\d+)\s+kB$/m.exec(statut)
    const octets = mesure ? Number(mesure[1]) * 1024 : NaN
    if (Number.isSafeInteger(octets) && octets > 0) return octets
    try {
      process.kill(pid, 0)
    } catch (absence) {
      if ((absence as NodeJS.ErrnoException).code === 'ESRCH') return null
    }
  }
  throw new Error('Mesure memoire indisponible')
}
