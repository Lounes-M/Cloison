// Essaie la verification 2D-Doc sur un fichier local, hors application.
//
// Usage : node scripts/essayer-2ddoc.mjs chemin/vers/avis.pdf
//         node scripts/essayer-2ddoc.mjs --emetteur FR03 AV01 [AAAA-MM-JJ]
//
// La seconde forme n'a besoin d'aucun document : elle cherche le certificat
// d'un emetteur chez son autorite et consulte sa revocation. Elle sert a
// confirmer les adresses de `lib/2ddoc/autorites.ts` pour une autorite.
//
// Sert a la recette sur un vrai avis d'imposition, depuis un poste qui joint
// les autorites de certification. Le fichier est lu par le meme moteur que
// l'application (processus local, sans conteneur) ; rien n'est envoye, sauf
// l'identifiant du certificat a l'autorite. La sortie n'affiche que l'en-tete
// du code et le resultat tel que l'agence le verrait : ni numero fiscal, ni
// contenu du document. Ne pas coller cette sortie dans un ticket public.
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { emetteursDeConfiance, telecharger } from '../lib/2ddoc/confiance.ts'
import { analyserCode } from '../lib/2ddoc/format.ts'
import { consulterRevocation } from '../lib/2ddoc/revocation.ts'
import { verifierCode2dDoc } from '../lib/2ddoc/verification.ts'

const TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

const journal = (ligne) => console.log(`  ${ligne}`)

async function essayerEmetteur(
  autorite,
  identifiant,
  jour = new Date().toISOString().slice(0, 10),
) {
  if (!autorite || !identifiant || Number.isNaN(Date.parse(jour)))
    throw new Error('Attendu : --emetteur <autorite> <identifiant> [AAAA-MM-JJ]')
  console.log(`Emetteur ${identifiant} de ${autorite}, au ${jour}`)
  const emetteurs = await emetteursDeConfiance(autorite, identifiant, new Date(jour), { journal })
  if (!emetteurs.length) console.log('Aucun certificat retenu')
  for (const { certificat, autorite: racine, organisation } of emetteurs) {
    console.log(
      `Certificat retenu : ${organisation}, valide du ${certificat.validFrom} au ${certificat.validTo}`,
    )
    const etat = await consulterRevocation(certificat, racine, { telecharger, journal })
    console.log(`Revocation : ${etat}`)
  }
}

try {
  if (process.argv[2] === '--emetteur') {
    await essayerEmetteur(...process.argv.slice(3, 6))
    process.exit()
  }
  const chemin = process.argv[2]
  const type = TYPES[extname(chemin ?? '').toLowerCase()]
  if (!chemin || !type) throw new Error('Fichier PDF, PNG ou JPEG attendu')
  const moteur = spawnSync(process.execPath, ['--max-old-space-size=128', 'workers/document.mjs'], {
    env: { LANG: 'C.UTF-8', TZ: 'UTC', NODE_ENV: 'production', DISABLE_SYSTEM_FONTS_LOAD: '1' },
    input: JSON.stringify({
      operation: 'lire_code',
      type,
      filigrane: '',
      contenu: (await readFile(chemin)).toString('base64'),
    }),
    maxBuffer: 64 * 1024,
    timeout: 20000,
  })
  const sortie = JSON.parse(moteur.stdout.toString('utf8'))
  if (sortie.ok !== true) throw new Error('Document refuse par le moteur')
  const code = Buffer.from(sortie.code, 'base64')
  const entete = analyserCode(code)
  console.log(
    entete
      ? `Code lu : version ${entete.version}, autorite ${entete.autorite}, certificat ${entete.certificat}, type ${entete.type}, date ${entete.date?.toISOString().slice(0, 10) ?? 'absente'}`
      : code.length
        ? 'Code lu, mais sa forme n est pas reconnue'
        : 'Aucun code 2D-Doc lisible',
  )
  console.log(JSON.stringify(await verifierCode2dDoc(code, { journal }), null, 2))
} catch (erreur) {
  console.error(`Essai impossible : ${erreur instanceof Error ? erreur.message : 'erreur'}`)
  process.exitCode = 1
}
