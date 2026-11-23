import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scellerMaitresse } from '@/lib/coffre/rotation-maitresse'
import { env } from '@/lib/env'
import { courrielsRappels as tFr, courrielsRelanceLocataire as lFr } from '@/lib/content/rappels'
import { adresseDuSite } from './envoi'
import { courrielsRappels as tEn, courrielsRelanceLocataire as lEn } from '@/lib/content/en/rappels'
import { choisir, lien, locale, type Langue } from '@/lib/i18n'
import { languesCourriels } from '@/lib/langue-preferee'
import { composerCourriel, type Corps } from './gabarit'
const rappel = z.object({
  id: z.uuid(),
  dossier_id: z.uuid(),
  reference: z.string().min(8).max(32),
  nature: z.enum(['depot', 'echeance', 'epuise']),
  email: z.email().max(180),
  expiration: z.iso.datetime({ offset: true }),
})
/** La relance du locataire (migration 0089) : le motif choisit le texte. */
const relanceLocataire = rappel
  .omit({ nature: true })
  .extend({ motif: z.enum(['paiement', 'garant', 'loyer']) })
export async function preparerRappels(db: SupabaseClient, signal?: AbortSignal) {
  const { data: compte, error: planification } = await db.rpc('programmer_rappels')
  if (planification || !Number.isInteger(compte) || compte < 0 || compte > 20)
    throw new Error('Planification des rappels indisponible')
  const { data, error } = await db.rpc('rappels_a_preparer')
  const resultat = z.array(rappel).max(20).safeParse(data)
  if (error || !resultat.success) throw new Error('Rappels indisponibles')
  let echecs = 0
  for (const r of resultat.data) {
    signal?.throwIfAborted()
    // Le rappel de depot va au garant, les deux autres a l'agence : chacun
    // le lit dans sa langue.
    const langue = (await languesCourriels(db, r.dossier_id, [r.email]))(r.email)
    const t = choisir(langue, tFr, tEn)
    const corps = composerCourriel(
      {
        langue,
        espace: r.nature === 'depot' ? 'garant' : 'agence',
        sujet: t[r.nature].sujet,
        paragraphes: [t[r.nature].texte],
        ...(r.nature !== 'depot'
          ? { bouton: { url: `${adresseDuSite()}/espace/dossiers/${r.dossier_id}` } }
          : {}),
        details: [
          { libelle: t.reference, valeur: r.reference },
          { libelle: t.expiration, valeur: dateLisible(r.expiration, langue) },
        ],
      },
      adresseDuSite(),
    )
    if (!(await mettreEnFile(db, r.id, r.email, t[r.nature].sujet, corps))) echecs++
  }
  // Les relances du locataire ont leur propre lecture : `rappels_a_preparer`
  // garde le contrat que connaissait le code precedent.
  const { data: attentes, error: refus } = await db.rpc('rappels_locataire_a_preparer')
  const relances = z.array(relanceLocataire).max(20).safeParse(attentes)
  if (refus || !relances.success) throw new Error('Relances du locataire indisponibles')
  for (const r of relances.data) {
    signal?.throwIfAborted()
    const langue = (await languesCourriels(db, r.dossier_id, [r.email]))(r.email)
    const t = choisir(langue, lFr, lEn)
    // Aucun lien de capacite : le bouton mene a la page publique ou le
    // locataire peut redemander son lien avec sa reference.
    const corps = composerCourriel(
      {
        langue,
        espace: 'locataire',
        sujet: t[r.motif].sujet,
        paragraphes: [t[r.motif].texte, t.lienExpire],
        bouton: { url: `${adresseDuSite()}${lien(langue, '/demarrer')}`, libelle: t.bouton },
        details: [
          { libelle: t.reference, valeur: r.reference },
          { libelle: t.expiration, valeur: dateLisible(r.expiration, langue) },
        ],
      },
      adresseDuSite(),
    )
    if (!(await mettreEnFile(db, r.id, r.email, t[r.motif].sujet, corps))) echecs++
  }
  return { echecs }
}

function dateLisible(expiration: string, langue: Langue) {
  return new Date(expiration).toLocaleString(locale(langue), {
    timeZone: 'Europe/Paris',
    dateStyle: 'long',
    timeStyle: 'short',
  })
}

/** Chiffre le courriel et le confie a la file ; `false` si la base ne l'a ni pris ni declare obsolete. */
async function mettreEnFile(
  db: SupabaseClient,
  id: string,
  email: string,
  sujet: string,
  corps: Corps,
) {
  const contenu = {
    from: env.emailExpediteur,
    ...(env.emailSupport ? { replyTo: env.emailSupport } : {}),
    to: [email],
    subject: sujet,
    text: corps.text,
    html: corps.html,
  }
  const { data: confirmation, error: refus } = await db.rpc('mettre_rappel_en_file', {
    identifiant: id,
    chiffre: scellerMaitresse(Buffer.from(JSON.stringify(contenu))).toString('base64'),
  })
  return !refus && ['prepare', 'obsolete'].includes(confirmation)
}
