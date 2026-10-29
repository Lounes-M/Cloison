/**
 * Le rendu PDF de l'acte redige par `modele-cautionnement`.
 *
 * Le PDF doit passer le meme controle que celui d'une agence
 * (`workers/validation-acte.ts`) : pages A4 droites, aucun formulaire, aucune
 * action, aucune piece jointe. Le champ de signature n'est pas dessine comme un
 * champ PDF : on reserve sa place et on renvoie sa position, que le
 * prestataire recoit avec la demande.
 *
 * Le rendu est deterministe : memes donnees, memes octets. C'est ce qui permet
 * de redeposer exactement le meme projet apres une interruption.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { CHAMP_SIGNATURE, type PositionSignature } from '@/lib/signature/position'
import { redigerActe, type DonneesActe } from './modele-cautionnement'

const A4 = { largeur: 595.28, hauteur: 841.89 }
const MARGE = 56
const LARGEUR = A4.largeur - 2 * MARGE
const ENCRE = rgb(0.08, 0.08, 0.1)
const GRIS = rgb(0.38, 0.38, 0.42)

export class TexteNonImprimable extends Error {}

/**
 * Les polices standard du PDF ne couvrent que le jeu WinAnsi, qui contient
 * tout le francais. Les espaces fines n'y sont pas : on les rend en espaces
 * insecables, ce qui ne change pas le texte lu. Tout autre caractere hors du
 * jeu est refuse plutot que remplace : la mention ne se retouche pas.
 */
function imprimable(texte: string, police: PDFFont) {
  const t = texte.replace(/[   ]/g, ' ').replace(/\r\n?/g, '\n')
  try {
    police.encodeText(t.replace(/\n/g, ' '))
  } catch {
    throw new TexteNonImprimable()
  }
  return t
}

function couper(texte: string, police: PDFFont, taille: number, largeur: number) {
  const lignes: string[] = []
  for (const paragraphe of texte.split('\n')) {
    let ligne = ''
    for (const mot of paragraphe.split(/ +/)) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (ligne && police.widthOfTextAtSize(essai, taille) > largeur) {
        lignes.push(ligne)
        ligne = mot
      } else ligne = essai
    }
    lignes.push(ligne)
  }
  return lignes
}

export type ProjetActe = { pdf: Uint8Array; signature: PositionSignature; titre: string }

export async function genererActePdf(donnees: DonneesActe): Promise<ProjetActe> {
  const acte = redigerActe(donnees)
  const doc = await PDFDocument.create({ updateMetadata: false })
  const fixe = new Date(`${donnees.fait.le}T00:00:00Z`)
  doc.setTitle(acte.titre)
  doc.setCreator('Cloison')
  doc.setProducer('Cloison')
  doc.setLanguage('fr-FR')
  doc.setCreationDate(fixe)
  doc.setModificationDate(fixe)

  const regulier = await doc.embedFont(StandardFonts.Helvetica, { subset: false })
  const gras = await doc.embedFont(StandardFonts.HelveticaBold, { subset: false })
  const italique = await doc.embedFont(StandardFonts.HelveticaOblique, { subset: false })

  let page: PDFPage = doc.addPage([A4.largeur, A4.hauteur])
  let y = A4.hauteur - MARGE
  const nouvellePage = () => {
    page = doc.addPage([A4.largeur, A4.hauteur])
    y = A4.hauteur - MARGE
  }
  const place = (hauteur: number) => {
    if (y - hauteur < MARGE + 24) nouvellePage()
  }
  const ecrire = (
    texte: string,
    o: {
      police?: PDFFont
      taille?: number
      retrait?: number
      droite?: number
      couleur?: typeof ENCRE
    } = {},
  ) => {
    const police = o.police ?? regulier
    const taille = o.taille ?? 10
    const retrait = o.retrait ?? 0
    const interligne = taille * 1.4
    for (const ligne of couper(
      imprimable(texte, police),
      police,
      taille,
      LARGEUR - retrait - (o.droite ?? 0),
    )) {
      place(interligne)
      y -= interligne
      page.drawText(ligne, {
        x: MARGE + retrait,
        y: y + taille * 0.3,
        size: taille,
        font: police,
        color: o.couleur ?? ENCRE,
      })
    }
  }

  let signature: PositionSignature | null = null
  for (const bloc of acte.blocs) {
    switch (bloc.type) {
      case 'titre':
        ecrire(bloc.texte.toUpperCase(), { police: gras, taille: 18 })
        y -= 4
        break
      case 'sous-titre':
        ecrire(bloc.texte, { police: italique, taille: 10, couleur: GRIS })
        y -= 8
        break
      case 'rubrique':
        place(40)
        y -= 12
        ecrire(bloc.texte, { police: gras, taille: 11.5 })
        page.drawLine({
          start: { x: MARGE, y: y - 2 },
          end: { x: MARGE + LARGEUR, y: y - 2 },
          thickness: 0.6,
          color: GRIS,
        })
        y -= 6
        break
      case 'champ':
        ecrire(bloc.libelle, { police: gras, taille: 9, couleur: GRIS })
        ecrire(bloc.valeur, { retrait: 12 })
        y -= 3
        break
      case 'paragraphe':
        ecrire(bloc.texte)
        y -= 5
        break
      case 'citation':
        ecrire(bloc.texte, { police: italique, taille: 9.5, retrait: 18 })
        y -= 5
        break
      case 'mention': {
        const lignes = couper(imprimable(bloc.texte, regulier), regulier, 10.5, LARGEUR - 24)
        const hauteur = lignes.length * 10.5 * 1.4 + 16
        // La mention ne se coupe pas entre deux pages, sauf si elle depasse une page.
        if (hauteur < A4.hauteur - 2 * MARGE - 40) place(hauteur)
        const depart = page
        const haut = y
        y -= 8
        ecrire(bloc.texte, { taille: 10.5, retrait: 12, droite: 12 })
        y -= 8
        if (page === depart)
          page.drawRectangle({
            x: MARGE,
            y,
            width: LARGEUR,
            height: haut - y,
            borderColor: ENCRE,
            borderWidth: 0.8,
          })
        y -= 4
        ecrire(bloc.legende, { police: italique, taille: 8.5, couleur: GRIS })
        break
      }
      case 'signature': {
        place(120)
        y -= 18
        for (const ligne of bloc.lignes) ecrire(ligne)
        y -= 8
        const x = MARGE + LARGEUR - CHAMP_SIGNATURE.largeur - 40
        const bas = y - CHAMP_SIGNATURE.hauteur - 8
        page.drawRectangle({
          x: x - 8,
          y: bas - 4,
          width: CHAMP_SIGNATURE.largeur + 16,
          height: CHAMP_SIGNATURE.hauteur + 16,
          borderColor: GRIS,
          borderWidth: 0.6,
          borderDashArray: [3, 2],
        })
        // Repere du placement : depuis le coin superieur gauche, comme le prestataire.
        signature = {
          page: doc.getPageCount(),
          x: Math.round(x),
          y: Math.round(A4.hauteur - (bas + 4 + CHAMP_SIGNATURE.hauteur)),
        }
        y = bas - 8
        break
      }
    }
  }
  if (!signature) throw new Error('Champ de signature absent')

  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const pied = `${acte.pied}   Page ${i + 1} sur ${pages.length}`
    p.drawText(imprimable(pied, regulier), {
      x: MARGE,
      y: MARGE - 24,
      size: 7.5,
      font: regulier,
      color: GRIS,
    })
  })

  return { pdf: await doc.save({ useObjectStreams: false }), signature, titre: acte.titre }
}
