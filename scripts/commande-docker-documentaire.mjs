import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

/** Client local uniquement. Aucun document, secret ou option libre en argument. */
export function commandeDocker(
  argumentsDocker,
  entree = Buffer.alloc(0),
  maximum = 4096,
  delai = 5000,
) {
  const socket =
    process.platform === 'darwin'
      ? `unix://${homedir()}/.docker/run/docker.sock`
      : 'unix:///var/run/docker.sock'
  return new Promise((resolve, reject) => {
    const enfant = spawn('docker', ['--host', socket, ...argumentsDocker], {
      env: { PATH: process.env.PATH ?? '', HOME: homedir() },
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const blocs = []
    let taille = 0
    let erreur = false
    const refuser = () => {
      erreur = true
      enfant.kill('SIGKILL')
    }
    const minuterie = setTimeout(refuser, delai)
    enfant.on('error', refuser)
    enfant.stdin.on('error', refuser)
    enfant.stdout.on('error', refuser)
    enfant.stdout.on('data', (bloc) => {
      taille += bloc.length
      if (taille > maximum) refuser()
      else if (!erreur) blocs.push(bloc)
    })
    enfant.on('close', (code, signal) => {
      clearTimeout(minuterie)
      if (erreur || code !== 0 || signal) reject(new Error('Commande documentaire refusee'))
      else resolve(Buffer.concat(blocs))
    })
    enfant.stdin.end(entree)
  })
}
