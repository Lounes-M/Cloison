import 'server-only'
import { readFile } from 'node:fs/promises'

/** Mesure Linux du processus enfant, sans cooperation du decodeur. */
export async function lireMemoireProcessus(pid: number): Promise<number | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Mesure memoire indisponible')
  let statut: string
  try {
    statut = await readFile(`/proc/${pid}/status`, 'utf8')
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        process.kill(pid, 0)
      } catch (absence) {
        if ((absence as NodeJS.ErrnoException).code === 'ESRCH') return null
      }
    }
    throw new Error('Mesure memoire indisponible')
  }
  // Un zombie n'a plus de memoire residente ; attendre ensuite close pour le slot.
  if (/^State:\s+Z\b/m.test(statut)) return null
  const mesure = /^VmRSS:\s+(\d+)\s+kB$/m.exec(statut)
  const octets = mesure ? Number(mesure[1]) * 1024 : NaN
  if (!Number.isSafeInteger(octets) || octets <= 0) throw new Error('Mesure memoire indisponible')
  return octets
}
