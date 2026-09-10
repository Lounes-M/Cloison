// Lecture administrative ciblee, sans appel fournisseur ni acquittement d'anomalie.
export async function diagnostiquerPaiement(db, reference) {
  if (typeof reference !== 'string' || !/^cs_[A-Za-z0-9_]{1,196}$/.test(reference))
    throw new Error('Reference invalide')
  await db.query('begin isolation level repeatable read read only')
  try {
    await db.query("set local statement_timeout='5s'")
    await db.query("set local lock_timeout='1s'")
    await db.query("set local idle_in_transaction_session_timeout='10s'")
    const lire = async (sql, valeurs = [reference]) => {
      const { rows } = await db.query(sql + ' limit 501', valeurs)
      if (rows.length > 500) throw new Error('Historique trop volumineux')
      return rows
    }
    const { rows: horloge } = await db.query('select transaction_timestamp() as observe_le')
    const reservation =
      await lire(`select dossier_id,session_ref,cree_le,tarif_version,montant_cents,devise
      from public.sessions_paiement where session_ref=$1`)
    const registre =
      await lire(`select reference_session,reference_paiement,dossier_id,source_dossier,
      montant_cents,devise,tarif_version,marque,anomalie,recu_le,survenu_le,origine,paye_fournisseur
      from public.registre_paiements where reference_session=$1`)
    const observations =
      await lire(`select id,reference_session,reference_paiement,montant_cents,devise,paye,observe_le
      from public.rapprochements_paiements where reference_session=$1 order by observe_le,id`)
    // Les evenements et observations peuvent conserver une ancienne reference PaymentIntent.
    // La reunir avant de lire les suivis evite de perdre un remboursement dans ce cas.
    const directs =
      await lire(`select id,nature,reference_objet,reference_paiement,reference_session,source_dossier,
      montant_cents,devise,tarif_version,etat,survenu_le,recu_le,anomalie
      from public.evenements_paiements where reference_session=$1 or reference_objet=$1 order by survenu_le,id`)
    if (!reservation.length && !registre.length && !observations.length && !directs.length)
      throw new Error('Session inconnue')
    const intentions = [
      ...new Set(
        [...registre, ...observations, ...directs].map((r) => r.reference_paiement).filter(Boolean),
      ),
    ]
    const evenements = await lire(
      `select id,nature,reference_objet,reference_paiement,reference_session,source_dossier,
      montant_cents,devise,tarif_version,etat,survenu_le,recu_le,anomalie
      from public.evenements_paiements where reference_session=$1 or reference_objet=$1
      or reference_paiement=any($2::text[]) order by survenu_le,id`,
      [reference, intentions],
    )
    const sessions_associees = await lire(
      `select reference_session,reference_paiement,source_dossier,
      montant_cents,devise,tarif_version,marque,anomalie,origine,paye_fournisseur
      from public.registre_paiements where reference_session<>$1 and reference_paiement=any($2::text[])
      order by reference_session`,
      [reference, intentions],
    )
    const tentatives =
      await lire(`select reference_session,essaye_le from public.tentatives_rapprochement
      where reference_session=$1`)
    const versions = [
      ...new Set(
        [...reservation, ...registre, ...evenements, ...sessions_associees]
          .map((r) => r.tarif_version)
          .filter(Boolean),
      ),
    ]
    const tarifs = await lire(
      `select version,montant_cents,devise from public.tarifs_paiement
      where version=any($1::text[]) order by version`,
      [versions],
    )
    return {
      version: 1,
      observe_le: horloge[0].observe_le,
      reference_session: reference,
      reservation,
      registre,
      observations,
      evenements,
      sessions_associees,
      tentatives,
      tarifs,
    }
  } finally {
    await db.query('rollback')
  }
}
