import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const API = 'https://api.resend.com/emails'
const COURRIEL = /^[^\s@<>]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i
/** Message d'alerte sans donnee de dossier : seuls le workflow et le lien du passage sortent de GitHub. */
export function messageAlerte(env) {
  const { GITHUB_WORKFLOW: workflow, GITHUB_REPOSITORY: depot, GITHUB_RUN_ID: passage } = env
  const tentative = env.GITHUB_RUN_ATTEMPT ?? '1'
  if (
    !/^[\w .-]{1,64}$/.test(workflow ?? '') ||
    !/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(depot ?? '') ||
    !/^\d{1,20}$/.test(passage ?? '') ||
    !/^\d{1,4}$/.test(tentative) ||
    env.GITHUB_SERVER_URL !== 'https://github.com'
  )
    throw new Error('Contexte GitHub invalide')
  const lien = `https://github.com/${depot}/actions/runs/${passage}/attempts/${tentative}`
  return {
    sujet: `[Cloison] Echec du workflow ${workflow}`,
    texte: [
      `Le workflow ${workflow} a echoue.`,
      `Passage : ${lien}`,
      '',
      'Ouvrir le rapport, puis suivre docs/exploitation/acces-anormaux.md.',
      'Ce courriel ne contient aucune donnee de dossier.',
    ].join('\n'),
    cle: `alerte-${depot.replace('/', '-')}-${passage}-${tentative}`,
  }
}
export async function alerterEchec(env) {
  const cle = env.ALERTE_RESEND_CLE,
    destinataire = env.ALERTE_DESTINATAIRE,
    expediteur = env.ALERTE_EXPEDITEUR
  if (!cle || !COURRIEL.test(destinataire ?? '') || !expediteur)
    throw new Error('Alerte non configuree')
  const message = messageAlerte(env)
  const reponse = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': message.cle,
    },
    body: JSON.stringify({
      from: expediteur,
      to: [destinataire],
      subject: message.sujet,
      text: message.texte,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  void reponse.body?.cancel().catch(() => {})
  if (!reponse.ok) throw new Error('Alerte refusee par le fournisseur')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await alerterEchec(process.env)
    console.log('Alerte transmise au fournisseur')
  } catch (e) {
    console.error(e instanceof Error && e.message ? e.message : 'Alerte non transmise')
    process.exitCode = 1
  }
}
