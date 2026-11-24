// Le build de production de Next, servi directement en HTTPS sur la boucle
// locale. `next start` ne sait pas le faire, et derriere un relais Next
// reconstruit l'adresse de la requete d'apres son propre port : les
// redirections et les controles d'origine verraient une autre origine que le
// navigateur. Ici l'origine vue par le code est celle de la barre d'adresse,
// comme chez l'hebergeur.
import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import next from 'next'

const port = Number(process.env.PARCOURS_PORT)
const app = next({ dev: false, hostname: 'localhost', port, dir: process.cwd() })
await app.prepare()
const traiter = app.getRequestHandler()
createServer(
  {
    key: readFileSync(process.env.PARCOURS_CLE),
    cert: readFileSync(process.env.PARCOURS_CERTIFICAT),
  },
  (requete, reponse) => {
    // Ce que poserait l'hebergeur : l'adresse du visiteur, dont dependent les
    // limitations de debit. Le parcours peut en changer par un en-tete.
    requete.headers['x-forwarded-for'] = String(requete.headers['x-parcours-ip'] ?? '203.0.113.10')
    delete requete.headers['x-parcours-ip']
    void traiter(requete, reponse)
  },
).listen(port, '127.0.0.1', () => console.log('PRET'))
