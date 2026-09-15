import { randomUUID, createHash } from 'node:crypto'

// Uniquement pour les bases jetables des harnais. Aucune donnee ou adresse reelle.
export async function fixtureCollecteDroits(db, nature = 'acces') {
  const garant = randomUUID(),
    locataire = randomUUID(),
    etranger = randomUUID()
  const email = `${randomUUID()}@example.invalid`
  await db.query("select set_config('request.jwt.claims','{}',false)")
  for (const id of [garant, locataire, etranger]) {
    await db.query(
      `insert into public.dossiers(id,email_locataire,email_garant,locataire_nom,loyer_cents)
      values($1,$2,$3,$4,100000)`,
      [
        id,
        id === locataire ? email : 'locataire-tiers@example.invalid',
        id === garant ? email : 'garant-tiers@example.invalid',
        id === locataire ? 'Locataire concerne' : 'Identite tierce interdite',
      ],
    )
    await db.query(
      `insert into public.engagements(dossier_id,nom,prenom,adresse,revenu_net_mensuel_cents,ratio,calcule_le)
      values($1,$2,'Prenom','Adresse fictive privee',9007199254740993,3.25,clock_timestamp())`,
      [id, id === garant ? 'Garant concerne' : 'Garant tiers interdit'],
    )
    await db.query(
      `insert into public.pieces(dossier_id,type,chemin,taille_octets,type_reel)
      values($1,'piece_identite',$2,100,'application/pdf')`,
      [id, `${id}/chemin-prive-interdit`],
    )
  }
  const decision = {
    version: 1,
    demande: randomUUID(),
    revision: randomUUID(),
    operateur: randomUUID(),
    nature,
    destinataire: {
      reference: randomUUID(),
      email,
      identiteSha256: 'a'.repeat(64),
      mandat: 'non_requis',
    },
    expireLe: new Date(Date.now() + 3600000).toISOString(),
    dossiers: [
      { id: garant, partie: 'garant' },
      { id: locataire, partie: 'locataire' },
    ],
  }
  const brut = JSON.stringify(decision, null, 2)
  const premiere = randomUUID()
  await db.query(
    `insert into public.suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    values($1,$2,$3,$4,'recue',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',clock_timestamp()+interval '4 days',repeat('b',64))`,
    [premiere, decision.demande, decision.operateur, nature],
  )
  await db.query(
    `insert into public.suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2 from public.suivi_demandes_droits where operation=$3`,
    [decision.revision, createHash('sha256').update(brut).digest('hex'), premiere],
  )
  return { brut, decision, garant, locataire, etranger }
}
