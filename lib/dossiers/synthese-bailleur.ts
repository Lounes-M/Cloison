/**
 * La synthese d'un dossier pour le bailleur : une page A4, dessinee.
 *
 * Ce module ne connait ni la base ni la personne connectee : il prend ce que
 * `preparer_synthese_bailleur` (0089) a rendu et le met en page. Le schema
 * ci-dessous est strict a dessein : il n'a pas de champ pour un revenu, et une
 * cle en trop fait echouer la lecture plutot que de voyager jusqu'au papier.
 *
 * Une seule page, toujours : les pieces sont regroupees par nature, et il n'en
 * existe que neuf. Un dossier de quarante photos tient donc dans le meme cadre
 * qu'un dossier de trois PDF.
 *
 * Ce qui sort d'ici est un PDF ordinaire, dont le texte se selectionne. Il ne
 * part jamais tel quel : `synthese-agence` le rasterise et le filigrane.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { z } from 'zod'

import { couper, imprimable } from '@/lib/acte/pdf-cautionnement'
import type { synthese as Fr } from '@/lib/content/synthese'
import { locale, type Langue, type Textes } from '@/lib/i18n'

const date = z.iso.datetime({ offset: true })
const ratio = z.coerce.number().min(0).max(999.99)

export const donneesSynthese = z.strictObject({
  reference: z.string().min(1).max(40),
  statut: z.enum(['complet', 'garant_insuffisant', 'transmis', 'signe']),
  demonstration: z.boolean(),
  locataire: z.string().max(240).nullable(),
  loyer_cents: z.number().int().positive().nullable(),
  logement: z.string().max(120).nullable(),
  agence: z.string().min(1).max(240),
  seuil: z.coerce.number().min(1).max(10),
  engagement: z
    .strictObject({
      garant: z.string().max(241).nullable(),
      couvre: z.enum(['loyer', 'loyer_charges']),
      plafond_cents: z.number().int().positive().nullable(),
      jusqu_au: z.iso.date().nullable(),
      solidaire: z.boolean(),
      mention_le: date.nullable(),
      ratio: ratio.nullable(),
      calcule_le: date.nullable(),
    })
    .nullable(),
  groupe: z
    .strictObject({ reference: z.string().min(1).max(40), ratio: ratio.nullable() })
    .nullable(),
  pieces: z
    .array(
      z.strictObject({
        type: z.string().min(1).max(60),
        documents: z.number().int().min(1).max(200),
        depose_le: date,
        examen: z.enum(['examine', 'a_revoir', 'a_examiner']).nullable(),
        examine_le: date.nullable(),
      }),
    )
    .max(400),
  acte: z
    .enum([
      'preparation',
      'a_valider',
      'valide',
      'document',
      'signataire',
      'activation',
      'en_cours',
      'archive',
      'incertain',
    ])
    .nullable(),
})

export type DonneesSynthese = z.infer<typeof donneesSynthese>

export type ContexteSynthese = {
  langue: Langue
  textes: Textes<typeof Fr>['pdf']
  /** Les libelles des natures de pieces, ceux de l'ecran de l'agence. */
  natures: Record<string, string>
  le: Date
}

type EtatExamen = 'examine' | 'a_revoir' | 'a_examiner'

export type NatureExaminee = {
  type: string
  documents: number
  etat: EtatExamen
  examineLe: string | null
}

/**
 * Les pieces, regroupees par nature dans l'ordre de leur premier depot.
 *
 * Une nature n'est « examinee » que si chacune de ses pieces l'est : deux
 * bulletins lus sur trois ne font pas des bulletins examines. Une seule piece
 * a revoir l'emporte sur le reste, parce que c'est elle que le bailleur doit
 * connaitre.
 */
export function naturesExaminees(pieces: DonneesSynthese['pieces']): NatureExaminee[] {
  const groupes = new Map<string, NatureExaminee & { toutes: boolean }>()
  for (const p of pieces) {
    const g = groupes.get(p.type) ?? {
      type: p.type,
      documents: 0,
      etat: 'examine' as EtatExamen,
      examineLe: null,
      toutes: true,
    }
    g.documents += p.documents
    if (p.examen === 'a_revoir') g.etat = 'a_revoir'
    if (p.examen !== 'examine') g.toutes = false
    if (p.examen === 'examine' && p.examine_le && (!g.examineLe || p.examine_le > g.examineLe))
      g.examineLe = p.examine_le
    groupes.set(p.type, g)
  }
  return [...groupes.values()].map(({ toutes, ...g }) => {
    const etat: EtatExamen = g.etat === 'a_revoir' ? 'a_revoir' : toutes ? 'examine' : 'a_examiner'
    return { ...g, etat, examineLe: etat === 'examine' ? g.examineLe : null }
  })
}

/** L'etat de l'acte, ramene a ce qu'un bailleur a besoin d'en savoir. */
export function etatActe(
  d: Pick<DonneesSynthese, 'acte' | 'statut'>,
): keyof Textes<typeof Fr>['pdf']['actes'] {
  if (d.acte === 'archive') return 'archive'
  if (d.statut === 'signe') return 'signe'
  if (d.acte === null) return 'aucun'
  if (d.acte === 'en_cours' || d.acte === 'incertain') return d.acte
  return 'preparation'
}

const A4 = { largeur: 595.28, hauteur: 841.89 }
const MARGE = 46
const LARGEUR = A4.largeur - 2 * MARGE
const ENCRE = rgb(0.08, 0.08, 0.1)
const GRIS = rgb(0.38, 0.38, 0.42)
const FILET = rgb(0.8, 0.8, 0.83)
const VERT = rgb(0.86, 0.95, 0.89)
const JAUNE = rgb(0.99, 0.94, 0.78)
const BLEU = rgb(0.88, 0.93, 0.99)

export async function dessinerSynthese(d: DonneesSynthese, c: ContexteSynthese) {
  const t = c.textes
  const doc = await PDFDocument.create({ updateMetadata: false })
  doc.setTitle(`${t.titre} ${d.reference}`)
  doc.setCreator('Cloison')
  doc.setProducer('Cloison')
  doc.setLanguage(locale(c.langue))
  doc.setCreationDate(c.le)
  doc.setModificationDate(c.le)

  const regulier = await doc.embedFont(StandardFonts.Helvetica, { subset: false })
  const gras = await doc.embedFont(StandardFonts.HelveticaBold, { subset: false })
  const italique = await doc.embedFont(StandardFonts.HelveticaOblique, { subset: false })
  const page = doc.addPage([A4.largeur, A4.hauteur])
  let y = A4.hauteur - MARGE

  const jour = (iso: string | Date) =>
    new Date(iso).toLocaleDateString(locale(c.langue), {
      timeZone: 'Europe/Paris',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  // Une date sans heure ne change pas de jour avec le fuseau.
  const jourCivil = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale(c.langue), {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  const nombre = (n: number) =>
    n.toLocaleString(locale(c.langue), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const euros = (cents: number) => {
    const montant = (cents / 100).toLocaleString(locale(c.langue), {
      minimumFractionDigits: cents % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    })
    return c.langue === 'en' ? `€${montant}` : `${montant} €`
  }

  type Style = {
    police?: PDFFont
    taille?: number
    couleur?: typeof ENCRE
    x?: number
    l?: number
    /** Les saisies libres sont bornees : au-dela, la ligne finit par des points. */
    lignes?: number
  }
  /** Ecrit un texte, coupe a la largeur, sous la position courante. */
  const ecrire = (texte: string, o: Style = {}) => {
    const police = o.police ?? regulier
    const taille = o.taille ?? 9.5
    const interligne = taille * 1.38
    let lignes = couper(imprimable(texte, police), police, taille, o.l ?? LARGEUR)
    if (o.lignes && lignes.length > o.lignes) {
      lignes = lignes.slice(0, o.lignes)
      lignes[o.lignes - 1] = `${lignes[o.lignes - 1]!.slice(0, -3)}...`
    }
    for (const ligne of lignes) {
      y -= interligne
      page.drawText(ligne, {
        x: o.x ?? MARGE,
        y: y + taille * 0.3,
        size: taille,
        font: police,
        color: o.couleur ?? ENCRE,
      })
    }
  }
  const rubrique = (titre: string) => {
    y -= 10
    ecrire(titre, { police: gras, taille: 11.5 })
    y -= 3
    page.drawLine({
      start: { x: MARGE, y },
      end: { x: MARGE + LARGEUR, y },
      thickness: 0.6,
      color: GRIS,
    })
    y -= 3
  }
  const COLONNE = 150
  /** Une ligne libelle / valeur ; la valeur peut tenir sur plusieurs lignes. */
  const champ = (libelle: string, valeur: string) => {
    const haut = y
    ecrire(libelle, { couleur: GRIS, l: COLONNE - 10 })
    const basLibelle = y
    y = haut
    ecrire(valeur, { police: gras, x: MARGE + COLONNE, l: LARGEUR - COLONNE, lignes: 2 })
    y = Math.min(y, basLibelle) - 2.5
  }
  const bandeau = (texte: string, fond: typeof ENCRE) => {
    const lignes = couper(imprimable(texte, gras), gras, 9.5, LARGEUR - 24)
    const hauteur = lignes.length * 9.5 * 1.38 + 12
    page.drawRectangle({ x: MARGE, y: y - hauteur, width: LARGEUR, height: hauteur, color: fond })
    y -= 6
    ecrire(texte, { police: gras, x: MARGE + 12, l: LARGEUR - 24 })
    y -= 6
  }

  // En-tete.
  page.drawText('Cloison', { x: MARGE, y: y - 10, size: 12, font: gras, color: ENCRE })
  const ref = imprimable(`${t.reference} ${d.reference}`, regulier)
  page.drawText(ref, {
    x: MARGE + LARGEUR - regulier.widthOfTextAtSize(ref, 9),
    y: y - 10,
    size: 9,
    font: regulier,
    color: GRIS,
  })
  y -= 24
  ecrire(t.titre, { police: gras, taille: 19 })
  y -= 2
  ecrire(t.sousTitre(d.agence, jour(c.le)), { police: italique, couleur: GRIS, lignes: 2 })
  if (d.demonstration) {
    y -= 8
    bandeau(t.demonstration, BLEU)
  }

  // Le dossier.
  rubrique(t.dossier)
  champ(t.locataire, d.locataire ?? t.nonRenseigne)
  if (d.logement) champ(t.logement, d.logement)
  champ(t.loyer, d.loyer_cents == null ? t.nonRenseigne : euros(d.loyer_cents))
  champ(t.garant, d.engagement?.garant ?? t.nonRenseigne)
  champ(t.decision, t.statuts[d.statut] ?? d.statut)

  // La solvabilite : le ratio et le seuil, jamais le revenu.
  rubrique(t.solvabilite)
  const e = d.engagement
  y -= 6
  if (e?.ratio == null) bandeau(t.ratioAttente, BLEU)
  else {
    const atteint = e.ratio >= d.seuil
    const verdict = atteint ? t.atteint : t.nonAtteint
    const hauteur = 44
    page.drawRectangle({
      x: MARGE,
      y: y - hauteur,
      width: LARGEUR,
      height: hauteur,
      color: atteint ? VERT : JAUNE,
    })
    page.drawText(imprimable(t.ratio(nombre(e.ratio)), gras), {
      x: MARGE + 12,
      y: y - 29,
      size: 18,
      font: gras,
      color: ENCRE,
    })
    const v = imprimable(verdict, gras)
    page.drawText(v, {
      x: MARGE + LARGEUR - 12 - gras.widthOfTextAtSize(v, 11),
      y: y - 27,
      size: 11,
      font: gras,
      color: ENCRE,
    })
    y -= hauteur + 4
  }
  ecrire(
    [t.seuil(nombre(d.seuil)), e?.calcule_le ? t.calcule(jour(e.calcule_le)) : '']
      .filter(Boolean)
      .join(' '),
  )
  if (d.groupe)
    ecrire(
      d.groupe.ratio == null
        ? t.groupeAttente(d.groupe.reference)
        : t.groupe(nombre(d.groupe.ratio), d.groupe.reference),
    )
  ecrire(t.ratioNote, { police: italique, taille: 8.5, couleur: GRIS })

  // L'engagement.
  rubrique(t.engagement)
  if (!e) ecrire(t.engagementAucun)
  else {
    champ(t.nature, e.solidaire ? t.solidaire : t.simple)
    champ(t.couvre, t.couvertures[e.couvre] ?? e.couvre)
    champ(t.plafond, e.plafond_cents == null ? t.sansPlafond : euros(e.plafond_cents))
    champ(t.duree, e.jusqu_au ? t.jusquAu(jourCivil(e.jusqu_au)) : t.dureeDuBail)
    champ(t.mention, e.mention_le ? t.mentionEcrite(jour(e.mention_le)) : t.mentionAbsente)
  }

  // Les pieces, par nature.
  rubrique(t.pieces)
  const natures = naturesExaminees(d.pieces)
  if (natures.length === 0) ecrire(t.piecesAucune)
  else {
    for (const n of natures) {
      const haut = y
      ecrire(c.natures[n.type] ?? n.type, { police: gras, l: 190 })
      const bas = y
      y = haut
      ecrire(t.documents(n.documents), { couleur: GRIS, x: MARGE + 200, l: 90 })
      y = haut
      ecrire(
        n.etat === 'examine' && n.examineLe ? t.examineLe(jour(n.examineLe)) : t.examens[n.etat],
        { x: MARGE + 300, l: LARGEUR - 300 },
      )
      y = Math.min(y, bas) - 2
      page.drawLine({
        start: { x: MARGE, y },
        end: { x: MARGE + LARGEUR, y },
        thickness: 0.4,
        color: FILET,
      })
    }
    y -= 3
    ecrire(t.bilan(natures.filter((n) => n.etat === 'examine').length, natures.length))
  }
  ecrire(t.piecesNote, { police: italique, taille: 8.5, couleur: GRIS })

  // L'acte.
  rubrique(t.acte)
  ecrire(t.actes[etatActe(d)], { police: gras })

  // Le pied, ancre en bas de page.
  const pied = couper(imprimable(t.pied, regulier), regulier, 7.5, LARGEUR)
  const hautPied = MARGE - 14 + pied.length * 10
  // Le contenu ne peut pas descendre dans le pied : neuf natures au plus.
  if (y < hautPied + 8)
    throw new Error(`Synthese trop longue pour une page (${Math.round(hautPied + 8 - y)})`)
  page.drawLine({
    start: { x: MARGE, y: hautPied + 4 },
    end: { x: MARGE + LARGEUR, y: hautPied + 4 },
    thickness: 0.4,
    color: FILET,
  })
  pied.forEach((ligne, i) =>
    page.drawText(ligne, {
      x: MARGE,
      y: hautPied - 8 - i * 10,
      size: 7.5,
      font: regulier,
      color: GRIS,
    }),
  )

  return doc.save({ useObjectStreams: false })
}
