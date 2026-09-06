import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

import { clientPorteurDeLien, emettreLien, resoudreCapacite } from '@/lib/acces/session'
import { clientStockage } from '@/lib/acces/stockage'
import { deposer, type NatureDePiece } from '@/lib/coffre/depot'
import { baseSupabase } from '@/lib/coffre/depot-supabase'

/**
 * Le remplissage du dossier de demonstration.
 *
 * La base a ouvert le dossier (migration 0013). Ce module le remplit comme le
 * feraient un vrai garant et un vrai locataire, avec des jetons que le serveur
 * s'emet a lui-meme : memes politiques, meme chiffrement, meme journal. Une
 * demonstration qui passerait par d'autres chemins ne demontrerait rien, et
 * c'est aussi ce qui la rend sure : rien ici n'a plus de droits qu'un porteur
 * de lien.
 *
 * Aucun courriel ne part. Les adresses de demonstration existent pour que le
 * dossier ait une forme, pas pour etre ecrites.
 */

const LOYER_CENTS = 1_150_00
const REVENU_CENTS = 3_800_00
const PLAFOND_CENTS = 1_200_00

/** Ce que chaque piece de demonstration montre, en clair sur la page. */
const PIECES: { nature: NatureDePiece; titre: string; lignes: string[] }[] = [
  {
    nature: 'bulletin_paie',
    titre: 'Bulletin de paie',
    lignes: [
      'Periode : mois precedent',
      'Net a payer : 3 800,00 EUR',
      'Employeur : Societe Exemple',
    ],
  },
  {
    nature: 'avis_imposition',
    titre: 'Avis d’imposition',
    lignes: ['Revenu fiscal de reference : 45 600 EUR', 'Nombre de parts : 1'],
  },
  {
    nature: 'piece_identite',
    titre: 'Piece d’identite',
    lignes: ['Nom : GARANT', 'Prenom : Demonstration', 'Validite : en cours'],
  },
  {
    nature: 'justificatif_domicile',
    titre: 'Justificatif de domicile',
    lignes: ['Facture d’electricite', 'Adresse : 1 rue de l’Exemple, 69003 Lyon'],
  },
]

/**
 * Un PDF qui dit ce qu'il est, en grand et en travers.
 *
 * Quelqu'un qui verrait cette piece hors contexte doit comprendre en une
 * seconde qu'elle est fausse. Le mot est dans les pixels de chaque page, comme
 * le filigrane le sera a l'ouverture.
 */
async function pdfDeDemonstration(titre: string, lignes: string[]): Promise<Buffer> {
  const document = await PDFDocument.create()
  const police = await document.embedFont(StandardFonts.Helvetica)
  const grasse = await document.embedFont(StandardFonts.HelveticaBold)
  const page = document.addPage([595, 842])

  page.drawText(titre, { x: 60, y: 760, size: 22, font: grasse })
  page.drawText('Piece de demonstration Cloison. Aucune donnee reelle.', {
    x: 60,
    y: 730,
    size: 11,
    font: police,
    color: rgb(0.35, 0.35, 0.35),
  })

  lignes.forEach((ligne, index) => {
    page.drawText(ligne, { x: 60, y: 660 - index * 28, size: 13, font: police })
  })

  page.drawText('DEMONSTRATION', {
    x: 90,
    y: 300,
    size: 64,
    font: grasse,
    color: rgb(0.85, 0.85, 0.85),
    rotate: degrees(30),
  })

  return Buffer.from(await document.save())
}

/**
 * Remplit un dossier de demonstration fraichement ouvert.
 *
 * Rend `true` si tout est en place. Un dossier a moitie rempli n'est pas une
 * catastrophe : c'est une demonstration, et l'agence en verra l'etat reel.
 */
export async function remplirLaDemonstration(dossierId: string): Promise<boolean> {
  const garant = await emettreLien(dossierId, 'garant')
  const locataire = await emettreLien(dossierId, 'locataire')
  if (!garant || !locataire) return false
  const capacite = await resoudreCapacite(garant.jeton)
  if (!capacite) return false

  const commeGarant = clientPorteurDeLien(garant.jeton)
  const commeLocataire = clientPorteurDeLien(locataire.jeton)

  let complet = true

  // Le loyer, par le locataire : son seul droit d'ecriture avec le garant.
  const { error: loyer } = await commeLocataire
    .from('dossiers')
    .update({ loyer_cents: LOYER_CENTS })
    .eq('id', dossierId)
  if (loyer) {
    console.error('[demonstration] loyer refuse', loyer)
    complet = false
  }

  // L'engagement, par le garant.
  const dansTroisAns = new Date()
  dansTroisAns.setFullYear(dansTroisAns.getFullYear() + 3)
  const { error: engagement } = await commeGarant.from('engagements').insert({
    dossier_id: dossierId,
    couvre: 'loyer_charges',
    montant_max_cents: PLAFOND_CENTS,
    jusqu_au: dansTroisAns.toISOString().slice(0, 10),
    solidaire: true,
    revenu_net_mensuel_cents: REVENU_CENTS,
  })
  if (engagement) {
    console.error('[demonstration] engagement refuse', engagement)
    complet = false
  }

  // Les pieces, par le garant, scellees comme les vraies.
  const base = baseSupabase(commeGarant as SupabaseClient, await clientStockage(capacite))
  for (const piece of PIECES) {
    const resultat = await deposer(
      base,
      dossierId,
      piece.nature,
      await pdfDeDemonstration(piece.titre, piece.lignes),
    )
    if (!resultat.depose) {
      console.error('[demonstration] depot refuse', piece.nature, resultat.raison)
      complet = false
    }
  }

  return complet
}
