import { z } from 'zod'

const empreinte = z.string().regex(/^[a-f0-9]{64}$/)
const date = z.iso.datetime()
const ressource = z.strictObject({
  id: z.uuid(),
  revision: z.uuid(),
  categorie: z.enum([
    'profil',
    'piece',
    'engagement',
    'acte',
    'paiement',
    'journal',
    'compte',
    'secret',
  ]),
  appartenance: z.enum(['demandeur', 'tiers', 'mixte', 'inconnue']),
  revueTiers: z.enum(['a_faire', 'validee']),
  portabilite: z.enum(['eligible', 'non_eligible', 'a_verifier']),
  dernierAdministrateur: z.boolean(),
  conservation: z
    .strictObject({
      motif: z.enum(['obligation_legale', 'defense_droits']),
      preuveSha256: empreinte,
      reexaminerLe: date,
    })
    .nullable(),
})
export const demandeDeDroits = z
  .strictObject({
    version: z.literal(1),
    demande: z.uuid(),
    revision: z.uuid(),
    operateur: z.uuid(),
    nature: z.enum(['acces', 'portabilite', 'effacement']),
    identite: z.strictObject({
      etat: z.enum(['a_verifier', 'verifiee', 'doute']),
      preuveSha256: empreinte.nullable(),
      mandat: z.enum(['non_requis', 'a_verifier', 'verifie']),
    }),
    perimetreConfirme: z.boolean(),
    inventaireComplet: z.boolean(),
    ressources: z.array(ressource).max(1000),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.ressources.map((r) => r.id)).size !== d.ressources.length)
      ctx.addIssue({ code: 'custom', message: 'Ressource dupliquee.' })
  })

export type DemandeDeDroits = z.infer<typeof demandeDeDroits>
type Avis = 'examiner' | 'exclure' | 'preparer_copie' | 'conserver' | 'proposer_effacement'

/** Previsualisation pure. Ne prouve pas les declarations et n'autorise aucune mutation. */
export function examinerDemande(entree: unknown, maintenant = Date.now()) {
  const lecture = demandeDeDroits.safeParse(entree)
  if (!lecture.success || !Number.isFinite(maintenant))
    throw new Error('Demande de droits invalide.')
  const d = lecture.data
  const blocages = [] as string[]
  if (d.identite.etat !== 'verifiee' || !d.identite.preuveSha256) blocages.push('identite')
  if (d.identite.mandat === 'a_verifier') blocages.push('mandat')
  if (!d.perimetreConfirme) blocages.push('perimetre')
  if (!d.inventaireComplet) blocages.push('inventaire')
  const ressources = d.ressources.map((r) => {
    const avis = (action: Avis, motif: string) => ({
      id: r.id,
      revision: r.revision,
      action,
      motif,
    })
    if (blocages.length) return avis('examiner', 'prerequis_incomplets')
    // Les secrets ne sont jamais restitues ; leur revocation releve du plan de securite.
    if (r.categorie === 'secret')
      return avis(d.nature === 'effacement' ? 'examiner' : 'exclure', 'secret')
    if (r.appartenance === 'tiers') return avis('exclure', 'tiers')
    if (r.appartenance === 'inconnue' || r.revueTiers !== 'validee')
      return avis('examiner', 'revue_tiers')
    if (d.nature !== 'effacement') {
      if (d.nature === 'portabilite' && r.portabilite !== 'eligible')
        return avis(r.portabilite === 'a_verifier' ? 'examiner' : 'exclure', 'portabilite')
      return avis(
        'preparer_copie',
        r.appartenance === 'mixte' ? 'copie_expurgee_a_relire' : 'copie_a_relire',
      )
    }
    if (r.appartenance === 'mixte') return avis('examiner', 'effacement_partiel')
    if (r.dernierAdministrateur) return avis('examiner', 'succession_administrateur')
    if (r.conservation)
      return avis(
        Date.parse(r.conservation.reexaminerLe) > maintenant ? 'conserver' : 'examiner',
        'conservation_motivee',
      )
    if (['acte', 'paiement', 'journal', 'compte'].includes(r.categorie))
      return avis('examiner', 'dependances_et_conservation')
    return avis('proposer_effacement', 'perimetre_individuel')
  })
  return {
    version: 1 as const,
    demande: d.demande,
    revision: d.revision,
    operateur: d.operateur,
    nature: d.nature,
    executionAutorisee: false as const,
    blocages,
    ressources,
    revueNecessaire: blocages.length > 0 || ressources.some((r) => r.action === 'examiner'),
  }
}
