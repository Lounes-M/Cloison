import { randomUUID, createHash } from 'node:crypto'
import { fixtureCollecteDroits } from './fixture-collecte-droits.mjs'
import { preparerEffacementPieces } from '../lib/droits/effacement-pieces.ts'

// Seulement dans une base jetable ; aucune donnee reelle.
export async function fixtureEffacementPieces(db) {
  const f = await fixtureCollecteDroits(db, 'effacement')
  const piece = (
    await db.query('select id,chemin from public.pieces where dossier_id=$1', [f.garant])
  ).rows[0]
  const projet = {
    version: 1,
    nature: 'effacement',
    demande: f.decision.demande,
    revision: randomUUID(),
    operation: randomUUID(),
    operateur: f.decision.operateur,
    demandeur: {
      email: f.decision.destinataire.email,
      identiteSha256: 'c'.repeat(64),
      mandat: 'non_requis',
    },
    expireLe: f.decision.expireLe,
    perimetre: 'pieces_selectionnees_uniquement',
    pieces: [
      {
        id: piece.id,
        dossier: f.garant,
        appartenance: 'demandeur',
        revueTiers: 'validee',
        conservation: 'aucune_apres_examen',
      },
    ],
  }
  const decision = await preparerEffacementPieces(db, JSON.stringify(projet))
  const brut = JSON.stringify(decision, null, 2)
  await db.query(
    `insert into public.suivi_demandes_droits
    (operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2
    from public.suivi_demandes_droits where operation=$3`,
    [decision.revision, createHash('sha256').update(brut).digest('hex'), f.decision.revision],
  )
  return { ...f, projet, decision, brut, piece }
}
