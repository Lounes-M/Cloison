import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'

/**
 * Les fournisseurs exterieurs, joues sur la boucle locale.
 *
 * - Resend : chaque courriel est garde en memoire, pour que le parcours suive
 *   le lien qu'un locataire ou un garant aurait recu.
 * - OpenRouter : la lecture des revenus rend ce que le parcours a programme.
 * - L'annuaire des entreprises : toujours la meme agence, en activite.
 *
 * Rien n'est envoye ni facture : aucun appel ne sort de la machine.
 */
export async function ouvrirFauxFournisseurs(port) {
  const courriels = []
  const appels = []
  const etat = { net: '2400.00', nature: 'bulletin_paie', panne: false }

  const serveur = createServer(async (requete, reponse) => {
    const morceaux = []
    for await (const m of requete) morceaux.push(m)
    const brut = Buffer.concat(morceaux).toString('utf8')
    const json = (statut, valeur) => {
      const corps = JSON.stringify(valeur)
      reponse.writeHead(statut, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(corps),
      })
      reponse.end(corps)
    }
    try {
      const url = new URL(requete.url, 'http://127.0.0.1')
      appels.push({ methode: requete.method, chemin: url.pathname })
      // Deux portes de service, pour piloter le faux depuis un autre processus
      // quand l'environnement tourne seul (`node environnement.mjs`).
      if (requete.method === 'GET' && url.pathname === '/_courriels') return json(200, courriels)
      if (requete.method === 'POST' && url.pathname === '/_etat') {
        Object.assign(etat, JSON.parse(brut))
        return json(200, etat)
      }
      if (requete.method === 'POST' && url.pathname === '/resend/emails') {
        const courriel = JSON.parse(brut)
        // Unique d'un demarrage a l'autre : la base refuse deux courriels
        // acquittes sous la meme reference fournisseur.
        const id = randomUUID()
        courriels.push({ id, recu: Date.now(), ...courriel })
        return json(200, { id })
      }
      if (requete.method === 'POST' && url.pathname === '/openrouter/api/v1/chat/completions') {
        const demande = JSON.parse(brut)
        if (etat.panne) return json(503, { error: 'panne programmee' })
        const schema = demande.response_format?.json_schema?.name
        if (schema === 'justificatif_revenus') {
          const documents =
            etat.nature === 'pension'
              ? [{ nature: 'pension', periode: '2026-10', netPaye: etat.net }]
              : ['2026-08', '2026-09', '2026-10'].map((periode) => ({
                  nature: 'bulletin_paie',
                  periode,
                  netPaye: etat.net,
                }))
          return json(200, {
            model: demande.model,
            choices: [
              { finish_reason: 'stop', message: { content: JSON.stringify({ documents }) } },
            ],
          })
        }
        if (schema === 'transcription') {
          const nombre = Number(/exactement (\d+) pages/.exec(demande.messages[0].content)?.[1])
          const pages = Array.from({ length: nombre }, (_, i) => ({
            page: i + 1,
            texte: `Texte fictif de la page ${i + 1}. Net paye 2 400,00.`,
          }))
          return json(200, {
            model: demande.model,
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ pages }) } }],
          })
        }
      }
      if (requete.method === 'GET' && url.pathname === '/annuaire/search') {
        // L'annuaire public des entreprises, consulte a la demande d'activation.
        return json(200, {
          results: [
            {
              siren: url.searchParams.get('q'),
              nom_complet: 'AGENCE DU PARCOURS',
              nom_raison_sociale: 'AGENCE DU PARCOURS',
              activite_principale: '68.31Z',
              etat_administratif: 'A',
              date_creation: '2015-03-02',
              siege: { libelle_commune: 'PARIS', liste_enseignes: [] },
            },
          ],
        })
      }
      return json(404, { error: 'inconnu du harnais' })
    } catch {
      return json(500, { error: 'faux fournisseur' })
    }
  })
  serveur.listen(port, '127.0.0.1')
  await once(serveur, 'listening')
  return {
    url: `http://127.0.0.1:${serveur.address().port}`,
    courriels,
    appels,
    etat,
    async fermer() {
      serveur.closeAllConnections()
      await new Promise((r) => serveur.close(r))
    },
  }
}
