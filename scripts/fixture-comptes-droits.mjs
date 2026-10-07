import { randomUUID, createHash } from 'node:crypto'
import { fixtureCollecteDroits } from './fixture-collecte-droits.mjs'

/** Exclusivement pour les bases jetables de test. */
export async function fixtureComptesDroits(db, nature = 'acces') {
  const f = await fixtureCollecteDroits(db, nature)
  const compte = randomUUID(),
    tiers = randomUUID(),
    agence = randomUUID()
  await db.query(
    `insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,created_at,updated_at,last_sign_in_at)
    values($1,$2,now(),'+33600000000',now(),now(),now(),now()),($3,'tiers-' || $3::uuid::text || '@example.invalid',now(),'+33700000000',now(),now(),now(),now())`,
    [compte, f.decision.destinataire.email, tiers],
  )
  await db.query(
    "insert into public.agences(id,nom,domaine) values($1,'Agence fictive',$1::uuid::text || '.example.invalid')",
    [agence],
  )
  await db.query(
    "insert into public.membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin'),($1,$3,'admin')",
    [agence, compte, tiers],
  )
  const decision = { ...f.decision, revision: randomUUID(), dossiers: [], comptes: [compte] }
  const brut = JSON.stringify(decision)
  await db.query(
    `insert into public.suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2
    from public.suivi_demandes_droits where operation=$3`,
    [decision.revision, createHash('sha256').update(brut).digest('hex'), f.decision.revision],
  )
  return { compte, tiers, agence, decision, brut }
}
