/**
 * Le modele d'acte de cautionnement d'un bail d'habitation.
 *
 * Calque sur le modele officiel de Service-Public.fr (simulateur
 * ActeCautionnement, fiche R42281, DILA, licence Etalab 2.0) : memes rubriques,
 * memes variantes (caution simple ou solidaire, duree determinee ou
 * indeterminee), memes textes de loi reproduits. Il ajoute ce que Cloison sait
 * deja : les conditions de l'engagement, l'identite du garant et sa mention.
 *
 * La mention de l'article 2297 n'est jamais redigee ici (ADR 0005). Le module
 * recopie, sans la retoucher, celle que le garant a saisie lui-meme, et refuse
 * de rediger l'acte si elle manque ou ne couvre pas le plafond de l'acte.
 *
 * Un acte par caution : deux garants donnent deux actes, chacun avec sa propre
 * mention. `coCautions` nomme les autres, parce que la renonciation au
 * benefice de division n'a de sens que s'il y en a.
 *
 * Pur : ni base, ni environnement, ni date courante. Tout se teste.
 */
import { z } from 'zod'
import { nombreEnLettres, verifierMention } from '@/lib/garant/mention'

export const MODELE_CAUTIONNEMENT = 'cloison-cautionnement-2026-10'

const texte = (min: number, max: number) => z.string().trim().min(min).max(max)
const jour = z.iso.date()
const cents = z.number().int().positive().max(99_999_999_999)

export const donneesActe = z.strictObject({
  caution: z.strictObject({
    civilite: z.enum(['madame', 'monsieur']),
    prenom: texte(1, 120),
    nom: texte(1, 120),
    naissanceLe: jour,
    naissanceLieu: texte(2, 160),
    adresse: texte(5, 400),
  }),
  locataire: texte(2, 240),
  coCautions: z.array(texte(2, 240)).max(3).default([]),
  bailleur: z.strictObject({ nom: texte(2, 240), adresse: texte(5, 400) }),
  mandataire: texte(2, 240).nullable().default(null),
  logement: texte(5, 400),
  loyer: z.strictObject({
    horsChargesCents: cents,
    chargesCents: z.number().int().min(0).max(99_999_999_999).nullable(),
    periodicite: z.enum(['mois', 'trimestre', 'an']),
    revisionLe: jour,
    irlTrimestre: z.number().int().min(1).max(4),
    irlAnnee: z.number().int().min(2000).max(2100),
  }),
  engagement: z.strictObject({
    solidaire: z.boolean(),
    couvre: z.enum(['loyer', 'loyer_charges']),
    plafondCents: cents,
    jusquAu: jour.nullable(),
  }),
  mention: z.strictObject({ texte: texte(40, 2000), saisieLe: z.iso.datetime({ offset: true }) }),
  fait: z.strictObject({ lieu: texte(2, 120), le: jour }),
})
export type DonneesActe = z.input<typeof donneesActe>

/** Un bloc du document : le rendu PDF ne connait rien d'autre. */
export type Bloc =
  | { type: 'titre'; texte: string }
  | { type: 'sous-titre'; texte: string }
  | { type: 'rubrique'; texte: string }
  | { type: 'champ'; libelle: string; valeur: string }
  | { type: 'paragraphe'; texte: string }
  | { type: 'citation'; texte: string }
  | { type: 'mention'; texte: string; legende: string }
  | { type: 'signature'; lignes: string[] }

export type ActeRedige = { titre: string; blocs: Bloc[]; pied: string }

export type RefusActe = 'mention_absente' | 'mention_incomplete' | 'mention_plafond' | 'dates'

export class ActeIncomplet extends Error {
  constructor(readonly motif: RefusActe) {
    super(`Acte incomplet : ${motif}`)
  }
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]
const PERIODE = { mois: 'mois', trimestre: 'trimestre', an: 'an' } as const
const ESPACE = ' '

function partiesDate(iso: string) {
  const [a, m, j] = iso.split('-').map(Number)
  return { annee: a!, mois: m!, jour: j! }
}

/** « 1er janvier 2027 », sans fuseau : une date d'acte est une date civile. */
export function dateLongue(iso: string, avecAnnee = true) {
  const { annee, mois, jour } = partiesDate(iso)
  const j = jour === 1 ? '1er' : String(jour)
  return `${j} ${MOIS[mois - 1]}${avecAnnee ? ` ${annee}` : ''}`
}

/** « 1 250,50 € », espaces insecables, sans dependre de la locale du serveur. */
export function euros(centimes: number) {
  const entier = Math.floor(centimes / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE)
  const reste = centimes % 100
  return `${entier}${reste ? `,${String(reste).padStart(2, '0')}` : ''}${ESPACE}€`
}

/** « mille deux cent cinquante euros et cinquante centimes ». */
export function eurosEnLettres(centimes: number) {
  const entier = Math.floor(centimes / 100)
  const reste = centimes % 100
  const base = `${nombreEnLettres(entier)} euro${entier > 1 ? 's' : ''}`
  return reste ? `${base} et ${nombreEnLettres(reste)} centime${reste > 1 ? 's' : ''}` : base
}

const ORDINAL = ['1er', '2e', '3e', '4e']

export function redigerActe(entree: DonneesActe): ActeRedige {
  const d = donneesActe.parse(entree)
  const { caution: c, loyer: l, engagement: e } = d

  const verdict = verifierMention(d.mention.texte, e.solidaire)
  if (!verdict.ok) throw new ActeIncomplet('mention_incomplete')
  // La mention et l'acte doivent dire le meme plafond. En cas d'ecart, les
  // lettres de la mention l'emporteraient : on ne laisse pas l'ecart exister.
  if (Math.round(verdict.montantEuros * 100) !== e.plafondCents)
    throw new ActeIncomplet('mention_plafond')
  if (e.jusquAu && e.jusquAu <= d.fait.le) throw new ActeIncomplet('dates')
  if (c.naissanceLe >= d.fait.le) throw new ActeIncomplet('dates')

  const femme = c.civilite === 'madame'
  const ne = femme ? 'née' : 'né'
  const soussigne = femme ? 'soussignée' : 'soussigné'
  const informe = femme ? 'informée' : 'informé'
  const identite = `${c.prenom} ${c.nom}`
  const nature = e.solidaire ? 'solidaire' : 'simple'
  const periode = PERIODE[l.periodicite]
  const charges = e.couvre === 'loyer_charges'

  const blocs: Bloc[] = [
    { type: 'titre', texte: 'Acte de cautionnement' },
    {
      type: 'sous-titre',
      texte: `Caution ${nature} d’un bail d’habitation, loi n°${ESPACE}89-462 du 6 juillet 1989`,
    },
    { type: 'rubrique', texte: 'Les parties et le logement' },
    {
      type: 'champ',
      libelle: 'Caution',
      valeur: `${femme ? 'Madame' : 'Monsieur'} ${identite}, ${ne} le ${dateLongue(c.naissanceLe)} à ${c.naissanceLieu}, ${c.adresse}`,
    },
    { type: 'champ', libelle: 'Locataire', valeur: d.locataire },
    { type: 'champ', libelle: 'Bailleur', valeur: `${d.bailleur.nom}, ${d.bailleur.adresse}` },
    ...(d.mandataire
      ? [{ type: 'champ' as const, libelle: 'Mandataire du bailleur', valeur: d.mandataire }]
      : []),
    { type: 'champ', libelle: 'Logement loué', valeur: d.logement },
    ...(d.coCautions.length
      ? [{ type: 'champ' as const, libelle: 'Autres cautions', valeur: d.coCautions.join(' ; ') }]
      : []),

    { type: 'rubrique', texte: 'Engagement' },
    {
      type: 'paragraphe',
      texte: `Je ${soussigne} ${identite}, ${ne} le ${dateLongue(c.naissanceLe)} à ${c.naissanceLieu}, résidant à l’adresse suivante : ${c.adresse}, déclare me porter caution ${nature} de ${d.locataire}, pour le bail consenti par ${d.bailleur.nom}, demeurant ${d.bailleur.adresse}, portant sur le logement situé ${d.logement}.`,
    },
    {
      type: 'paragraphe',
      texte: `J’ai pris connaissance du montant du loyer de ${eurosEnLettres(l.horsChargesCents)}, soit ${euros(l.horsChargesCents)}, hors charges, payable par ${periode}${
        l.chargesCents
          ? `, auquel s’ajoute une provision sur charges de ${euros(l.chargesCents)} par ${periode}`
          : ''
      }.`,
    },
    {
      type: 'paragraphe',
      texte: `Il sera révisé annuellement tous les ${dateLongue(l.revisionLe, false)} selon la variation de l’indice de référence des loyers (IRL) publié par l’Insee, l’indice de référence étant celui du ${ORDINAL[l.irlTrimestre - 1]} trimestre ${l.irlAnnee}.`,
    },
    {
      type: 'paragraphe',
      texte: `Cet engagement vaut pour le paiement, en cas de défaillance du locataire, des loyers, des indemnités d’occupation${
        charges ? ', des charges' : ''
      }, des réparations et dégradations locatives, des impôts et taxes, ainsi que des frais de procédure et coûts des actes, dans la limite d’un montant maximum de ${eurosEnLettres(e.plafondCents)} (${euros(e.plafondCents)}) en principal et accessoires.`,
    },
    {
      type: 'paragraphe',
      texte: e.solidaire
        ? 'En qualité de caution solidaire, je renonce aux bénéfices de discussion et de division : le bailleur peut me demander le paiement dès la défaillance du locataire, sans avoir à poursuivre d’abord celui-ci ni à diviser ses poursuites entre les cautions.'
        : 'En qualité de caution simple, je conserve les bénéfices de discussion et de division : le bailleur doit d’abord poursuivre le locataire sur ses biens avant de me demander le paiement.',
    },
    {
      type: 'paragraphe',
      texte: e.jusquAu
        ? `Cet engagement est valable pour une durée déterminée, jusqu’au ${dateLongue(e.jusquAu)}. Je ne peux pas le résilier avant cette date.`
        : `Cet engagement est valable pour une durée indéterminée. J’ai été ${informe} que je peux le résilier unilatéralement, dans les conditions rappelées ci-dessous.`,
    },

    { type: 'rubrique', texte: 'Textes reproduits' },
    {
      type: 'paragraphe',
      texte:
        'Je reconnais avoir pris connaissance de l’avant-dernier alinéa de l’article 22-1 de la loi du 6 juillet 1989, selon lequel :',
    },
    {
      type: 'citation',
      texte:
        '« Lorsque le cautionnement d’obligations résultant d’un contrat de location conclu en application du présent titre ne comporte aucune indication de durée ou lorsque la durée du cautionnement est stipulée indéterminée, la caution peut le résilier unilatéralement. La résiliation prend effet au terme du contrat de location, qu’il s’agisse du contrat initial ou d’un contrat reconduit ou renouvelé, au cours duquel le bailleur reçoit notification de la résiliation. »',
    },
    {
      type: 'paragraphe',
      texte:
        'Je reconnais également avoir pris connaissance de l’article 2297 du code civil, selon lequel :',
    },
    {
      type: 'citation',
      texte:
        '« À peine de nullité de son engagement, la caution personne physique appose elle-même la mention qu’elle s’engage en qualité de caution à payer au créancier ce que lui doit le débiteur en cas de défaillance de celui-ci, dans la limite d’un montant en principal et accessoires exprimé en toutes lettres et en chiffres. En cas de différence, le cautionnement vaut pour la somme écrite en toutes lettres.',
    },
    {
      type: 'citation',
      texte:
        'Si la caution est privée des bénéfices de discussion ou de division, elle reconnaît dans cette mention ne pouvoir exiger du créancier qu’il poursuive d’abord le débiteur ou qu’il divise ses poursuites entre les cautions. À défaut, elle conserve le droit de se prévaloir de ces bénéfices. »',
    },
    {
      type: 'paragraphe',
      texte: 'Je reconnais avoir reçu un exemplaire du contrat de location.',
    },

    { type: 'rubrique', texte: 'Mention apposée par la caution' },
    {
      type: 'mention',
      texte: d.mention.texte,
      legende: `Mention saisie par la caution elle-même dans son espace Cloison, le ${dateLongue(d.mention.saisieLe.slice(0, 10))}, et reproduite sans modification (article 2297 du code civil).`,
    },

    {
      type: 'signature',
      lignes: [`Fait à ${d.fait.lieu}, le ${dateLongue(d.fait.le)}.`, `Signature de ${identite}`],
    },
  ]

  return {
    titre: `Acte de cautionnement ${nature}, ${identite}`,
    blocs,
    pied: `Modèle ${MODELE_CAUTIONNEMENT}, établi d’après le modèle de Service-Public.fr (DILA, licence Etalab 2.0).`,
  }
}
