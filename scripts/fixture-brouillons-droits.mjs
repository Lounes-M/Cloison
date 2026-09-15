import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { fixtureCollecteDroits } from './fixture-collecte-droits.mjs'
import { chiffrerBrouillon } from '../lib/brouillons/format.ts'
import { scellerAvecTrousseau } from '../lib/coffre/rotation-format.ts'

// Donnees fictives pour bases de test jetables uniquement.
export async function fixtureBrouillonsDroits(db, rotation = false) {
  const f = await fixtureCollecteDroits(db)
  const trousseau = {
    historique: randomBytes(32),
    active: rotation ? randomBytes(32) : null,
    lecture: [],
  }
  const cle = randomBytes(32),
    revision = randomUUID()
  const saisie = {
    profil: 'salarie',
    couvre: 'loyer',
    montant: '',
    revenu: '2800,50',
    jusquAu: '',
    solidaire: false,
  }
  const version = (
    await db.query('select version_conditions from engagements where dossier_id=$1', [f.garant])
  ).rows[0].version_conditions
  await db.query('insert into cles_dossier(dossier_id,cle_scellee) values($1,$2)', [
    f.garant,
    scellerAvecTrousseau(cle, trousseau),
  ])
  await db.query(
    `insert into brouillons_engagement(dossier_id,revision,version_conditions,chiffre,expire_le)
    values($1,$2,$3,$4,clock_timestamp()+interval '1 hour')`,
    [f.garant, revision, version, chiffrerBrouillon(saisie, f.garant, version, cle)],
  )
  cle.fill(0)
  const decision = {
    ...f.decision,
    revision: randomUUID(),
    brouillons: [{ dossier: f.garant, revision }],
  }
  const brut = JSON.stringify(decision)
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2 from suivi_demandes_droits where operation=$3`,
    [decision.revision, createHash('sha256').update(brut).digest('hex'), f.decision.revision],
  )
  return { brut, decision, trousseau, saisie, dossier: f.garant, locataire: f.locataire, revision }
}
