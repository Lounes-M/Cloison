import { examinerDemande } from '../lib/droits/regles.ts'

// Aucun argument nominatif, acces reseau ou fichier. Le rapport reste prive.
let taille = 0
const morceaux = []
const delai = setTimeout(() => {
  process.stderr.write('Lecture de la demande interrompue.\n')
  process.exit(1)
}, 5000)
try {
  if (process.argv.length !== 2 || process.stdin.isTTY) throw new Error()
  for await (const morceau of process.stdin) {
    taille += morceau.length
    if (taille > 256 * 1024) throw new Error()
    morceaux.push(morceau)
  }
  const rapport = examinerDemande(JSON.parse(Buffer.concat(morceaux).toString('utf8')))
  process.stdout.write(`${JSON.stringify(rapport)}\n`)
} catch {
  process.stderr.write('Demande de droits invalide. Aucun traitement execute.\n')
  process.exitCode = 1
} finally {
  clearTimeout(delai)
  for (const morceau of morceaux) morceau.fill(0)
}
