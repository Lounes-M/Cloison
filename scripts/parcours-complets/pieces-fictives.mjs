import { createCanvas } from '@napi-rs/canvas'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Des justificatifs entierement fictifs, fabriques a la volee : aucun fichier
 * binaire dans le depot, aucune donnee d'une vraie personne.
 */

/** Un PDF d'une ou plusieurs pages de texte. */
export async function pdfFictif(titre, pages = 1) {
  const pdf = await PDFDocument.create()
  const police = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = pdf.addPage([595, 842])
    page.drawText(`${titre} (fictif)`, { x: 60, y: 760, size: 18, font: police })
    page.drawText(`Page ${i} sur ${pages}. Net paye : 2 400,00 EUR.`, {
      x: 60,
      y: 720,
      size: 12,
      font: police,
    })
    page.drawText('Document de test, sans valeur. Jean Parcours, 1 rue du Test, Paris.', {
      x: 60,
      y: 690,
      size: 11,
      font: police,
    })
  }
  return {
    name: `${titre}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  }
}

/** Une photo JPEG, comme en prendrait un telephone : grande, donc a reduire. */
export function photoFictive(titre, largeur = 2400, hauteur = 3200) {
  const toile = createCanvas(largeur, hauteur)
  const c = toile.getContext('2d')
  c.fillStyle = '#f4efe6'
  c.fillRect(0, 0, largeur, hauteur)
  // Un fond non uniforme : une photo plate se compresse trop pour ressembler
  // a une vraie prise de vue.
  for (let i = 0; i < 400; i++) {
    c.fillStyle = `hsl(${(i * 37) % 360} 40% ${60 + (i % 30)}%)`
    c.fillRect((i * 97) % largeur, (i * 211) % hauteur, 180, 60)
  }
  c.fillStyle = '#111'
  c.font = `${Math.round(largeur / 14)}px sans-serif`
  c.fillText(`${titre} (fictif)`, largeur / 12, hauteur / 8)
  return { name: `${titre}.jpg`, mimeType: 'image/jpeg', buffer: toile.toBuffer('image/jpeg', 90) }
}
