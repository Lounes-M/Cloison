import {
  ouvrirAvecTrousseau,
  scellerAvecTrousseau,
  enteteCleActive,
} from '../lib/coffre/rotation-format.ts'

// Outil administratif importe par le lanceur. Aucun droit nouveau pour les roles applicatifs.
export async function rescellerEnveloppes(
  db,
  trousseau,
  { appliquer = false, maximum = 500 } = {},
) {
  if (!trousseau.active || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 500)
    throw new Error('Configuration de rescellement invalide')
  const cible = enteteCleActive(trousseau.active)
  const echeance = Date.now() + 60000
  const bilan = {
    examinees: 0,
    a_resceller: 0,
    rescellees: 0,
    courses: 0,
    echecs: 0,
    limite: false,
  }
  // Les deux noms et requetes sont statiques ; aucune table fournie par l'appelant.
  for (const nature of ['cle', 'courriel']) {
    let apres = '00000000-0000-0000-0000-000000000000'
    while (bilan.examinees < maximum) {
      if (Date.now() >= echeance) return { ...bilan, limite: true }
      const reste = Math.min(25, maximum - bilan.examinees)
      const { rows } = await db.query(
        nature === 'cle'
          ? `select dossier_id as id,cle_scellee as contenu from public.cles_dossier
           where dossier_id>$1::uuid and substring(cle_scellee from 1 for $4)<>$2::bytea
           order by dossier_id limit $3`
          : `select id,case when octet_length(contenu)<=2097152 then contenu end as contenu
           from public.courriels_sortants where id>$1::uuid and contenu is not null
           and case when octet_length(contenu)<=2097152 then substring(decode(contenu,'base64') from 1 for $4)<>$2::bytea else true end order by id limit $3`,
        [apres, cible, reste, cible.length],
      )
      if (!rows.length) break
      for (const ligne of rows) {
        apres = ligne.id
        bilan.examinees++
        try {
          const ancien =
            nature === 'cle' ? Buffer.from(ligne.contenu) : Buffer.from(ligne.contenu, 'base64')
          const clair = ouvrirAvecTrousseau(ancien, trousseau)
          const nouveau = scellerAvecTrousseau(clair, trousseau)
          if (!ouvrirAvecTrousseau(nouveau, trousseau).equals(clair))
            throw new Error('Verification refusee')
          if (nature === 'cle' && clair.length !== 32) throw new Error('Cle de dossier invalide')
          bilan.a_resceller++
          if (!appliquer) continue
          const retour = await db.query(
            nature === 'cle'
              ? `update public.cles_dossier set cle_scellee=$3 where dossier_id=$1::uuid and cle_scellee=$2 returning dossier_id as id`
              : `update public.courriels_sortants set contenu=$3 where id=$1::uuid and contenu=$2 returning id`,
            [
              ligne.id,
              nature === 'cle' ? ancien : ligne.contenu,
              nature === 'cle' ? nouveau : nouveau.toString('base64'),
            ],
          )
          if (retour.rows.length === 1) bilan.rescellees++
          else if (retour.rows.length === 0) bilan.courses++
          else throw new Error('Mise a jour ambigue')
        } catch {
          bilan.echecs++
        }
      }
      if (rows.length < reste) break
    }
  }
  bilan.limite = bilan.examinees === maximum
  return bilan
}
