import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'

// Refus avant import des decodeurs et avant lecture du document. Cible cgroup v2.
try {
  const refuser = () => {
    throw new Error('Confinement absent')
  }
  if (process.platform !== 'linux' || process.getuid() !== 65532) refuser()
  if (Object.keys(networkInterfaces()).some((nom) => nom !== 'lo')) refuser()
  const statut = await readFile('/proc/self/status', 'utf8')
  for (const [champ, attendu] of [
    ['CapEff', '0000000000000000'],
    ['CapBnd', '0000000000000000'],
    ['NoNewPrivs', '1'],
    ['Seccomp', '2'],
  ])
    if (new RegExp(`^${champ}:\\s*(\\S+)`, 'm').exec(statut)?.[1] !== attendu) refuser()
  const montages = await readFile('/proc/mounts', 'utf8')
  if (
    !montages.split('\n').some((ligne) => {
      const champs = ligne.split(' ')
      return champs[1] === '/' && champs[3]?.split(',').includes('ro')
    })
  )
    refuser()
  for (const [fichier, maximum] of [
    ['memory.max', 384 * 1024 * 1024],
    ['memory.swap.max', 0],
    ['pids.max', 64],
  ]) {
    const valeur = (await readFile('/sys/fs/cgroup/' + fichier, 'utf8')).trim()
    if (!/^\d+$/.test(valeur) || Number(valeur) > maximum) refuser()
  }
  const cpu = (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim().split(/\s+/)
  if (
    cpu.length !== 2 ||
    !cpu.every((v) => /^\d+$/.test(v)) ||
    Number(cpu[0]) <= 0 ||
    Number(cpu[1]) <= 0 ||
    Number(cpu[0]) > Number(cpu[1])
  )
    refuser()
  await import('./workers/document.mjs')
} catch {
  process.stderr.write('Confinement documentaire indisponible.\n')
  process.exitCode = 1
}
