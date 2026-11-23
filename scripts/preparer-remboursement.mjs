import { Client } from 'pg'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagnostiquerPaiement } from './diagnostic-paiement.mjs'
import { configurationDiagnostic, ecrireDiagnostic } from './examiner-paiement.mjs'
import { calculerRemboursement, jourDeParis } from '../lib/exploitation/remboursement-prorata.mjs'

export const FORMAT_REMBOURSEMENT = 'cloison-remboursement-prorata-v1'

export function configurationRemboursement(valeur) {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur))
    throw new Error('Configuration invalide')
  const { demande_le: demandeJour, ...reste } = valeur
  if (typeof demandeJour !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(demandeJour))
    throw new Error('Date de demande invalide')
  return { ...configurationDiagnostic(reste), demandeJour }
}

/**
 * Proposition chiffree a partir du diagnostic en lecture seule. Elle ne decide
 * rien : chaque motif bloque l'envoi et renvoie l'exploitant a l'examen manuel.
 */
export function proposerRemboursement(diagnostic, demandeJour) {
  const motifs = []
  const base = {
    version: 1,
    observe_le: new Date(diagnostic.observe_le).toISOString(),
    reference_session: diagnostic.reference_session,
  }
  const [paiement] = diagnostic.registre
  if (diagnostic.registre.length !== 1 || !paiement)
    return { ...base, eligible: false, motifs: ['paiement_introuvable'] }
  if (
    paiement.anomalie ||
    paiement.paye_fournisseur !== true ||
    diagnostic.evenements.some((e) => e.anomalie)
  )
    motifs.push('paiement_a_reconcilier')
  if (!paiement.reference_paiement) motifs.push('reference_paiement_absente')
  if (diagnostic.sessions_associees.length) motifs.push('reference_partagee')
  const suivis = diagnostic.evenements.filter(
    (e) => e.nature !== 'paiement' && e.reference_paiement === paiement.reference_paiement,
  )
  if (diagnostic.evenements.some((e) => e.nature === 'litige')) motifs.push('litige')
  if (suivis.some((e) => e.devise !== paiement.devise)) motifs.push('devise_incoherente')
  // Meme cumul que la supervision : le maximum observe par charge resiste aux rejeux.
  const parCharge = new Map()
  for (const e of diagnostic.evenements)
    if (e.nature === 'remboursement')
      parCharge.set(
        e.reference_objet,
        Math.max(parCharge.get(e.reference_objet) ?? 0, e.montant_cents),
      )
  const dejaRembourseCents = [...parCharge.values()].reduce((a, b) => a + b, 0)
  const calcul = calculerRemboursement({
    montantCents: paiement.montant_cents,
    payeLe: paiement.survenu_le,
    demandeJour,
    dejaRembourseCents,
  })
  if (calcul.jours_ecoules < 0 || demandeJour > jourDeParis(diagnostic.observe_le))
    motifs.push('demande_incoherente')
  else if (!calcul.dans_le_delai) motifs.push('hors_delai')
  if (calcul.a_rembourser_cents === 0) motifs.push('rien_a_rembourser')
  return {
    ...base,
    reference_paiement: paiement.reference_paiement ?? null,
    devise: paiement.devise,
    montant_paye_cents: paiement.montant_cents,
    paye_le: new Date(paiement.survenu_le).toISOString(),
    ...calcul,
    eligible: motifs.length === 0,
    motifs,
  }
}

export async function preparerRemboursement(config) {
  const c = configurationRemboursement(config)
  const db = new Client({
    connectionString: c.connexion,
    connectionTimeoutMillis: 5000,
    query_timeout: 6000,
    ssl: c.locale ? false : { rejectUnauthorized: true },
  })
  db.on('error', () => {})
  try {
    await db.connect()
    const diagnostic = await diagnostiquerPaiement(db, c.reference)
    const proposition = proposerRemboursement(diagnostic, c.demandeJour)
    await ecrireDiagnostic(c.destination, proposition, FORMAT_REMBOURSEMENT)
    return proposition.eligible
  } finally {
    await db.end().catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2 || process.stdin.isTTY)
      throw new Error('Entree privee obligatoire')
    const morceaux = []
    let taille = 0
    for await (const morceau of process.stdin) {
      taille += morceau.length
      if (taille > 8192) throw new Error('Configuration trop volumineuse')
      morceaux.push(morceau)
    }
    const eligible = await preparerRemboursement(
      JSON.parse(Buffer.concat(morceaux).toString('utf8')),
    )
    console.log(
      eligible
        ? 'Proposition privee enregistree ; aucun remboursement envoye.'
        : 'Proposition privee enregistree avec des motifs de blocage ; aucun remboursement envoye.',
    )
  } catch {
    console.error('Proposition indisponible ; aucune donnee financiere journalisee.')
    process.exitCode = 1
  }
}
