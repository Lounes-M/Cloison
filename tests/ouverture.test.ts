import { randomBytes } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { nouvelleCle, sceller } from '@/lib/coffre/enveloppe'
import {
  filigranePour,
  ouvrirPiecePourLAgence,
  type OuvertureBase,
  type PieceOuvrable,
} from '@/lib/coffre/ouverture'

/**
 * L'ouverture d'une piece.
 *
 * Une seule regle porte ce fichier, et c'est l'inverse de celle du depot : on
 * n'ouvre pas ce qu'on ne peut pas inscrire. Le reste des tests verifie qu'un
 * echec, quel qu'il soit, ne rend jamais le document d'origine.
 */

const DOSSIER = '44444444-4444-4444-4444-444444444444'
const PIECE = '99999999-9999-9999-9999-999999999999'

async function pdfDEssai(): Promise<Buffer> {
  const document = await PDFDocument.create()
  const police = await document.embedFont(StandardFonts.Helvetica)
  const page = document.addPage([595, 842])
  page.drawText('Bulletin de paie, mars', { x: 60, y: 700, size: 24, font: police })
  page.drawRectangle({ x: 60, y: 300, width: 400, height: 200, color: rgb(0.1, 0.1, 0.1) })
  return Buffer.from(await document.save({ useObjectStreams: false }))
}

/** Une base en memoire, ou tout est reglable et rien n'est reel. */
class BaseDeTest implements OuvertureBase {
  appels: string[] = []
  entrees: { dossierId: string; pieceId: string }[] = []

  metadonnees: PieceOuvrable | null = {
    dossierId: DOSSIER,
    chemin: `${DOSSIER}/bulletin`,
    typeReel: 'application/pdf',
  }

  cle: Buffer | null = null
  octets: Buffer | null = null
  echecJournal = false

  async piece(pieceId: string) {
    this.appels.push('piece')
    return pieceId === PIECE ? this.metadonnees : null
  }

  async cleScellee() {
    this.appels.push('cleScellee')
    return this.cle
  }

  async telecharger() {
    this.appels.push('telecharger')
    return this.octets
  }

  async journaliser(dossierId: string, _action: 'piece_ouverte', pieceId: string) {
    this.appels.push('journaliser')
    if (this.echecJournal) return false
    this.entrees.push({ dossierId, pieceId })
    return true
  }
}

/** Range un contenu comme le depot l'aurait fait : deux enveloppes. */
function ranger(base: BaseDeTest, contenu: Buffer) {
  const cleDuDossier = nouvelleCle()
  base.cle = sceller(cleDuDossier, Buffer.from(process.env.CLE_MAITRESSE!, 'base64'))
  base.octets = sceller(contenu, cleDuDossier)
}

beforeAll(() => {
  process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
})

describe('ouvrir une piece', () => {
  let base: BaseDeTest
  let document: Buffer

  beforeEach(async () => {
    base = new BaseDeTest()
    document = await pdfDEssai()
    ranger(base, document)
  })

  test('elle revient en PDF, jamais telle qu elle a ete deposee', async () => {
    const resultat = await ouvrirPiecePourLAgence(base, PIECE, 'marie@agence-lyon3.fr')
    if (!resultat.ouverte) throw new Error(resultat.raison)

    expect(resultat.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')

    // Ce n'est pas le document d'origine, c'en est une photographie.
    expect(resultat.pdf.equals(document)).toBe(false)
  }, 30_000)

  test('l inscription au journal precede tout dechiffrement', async () => {
    await ouvrirPiecePourLAgence(base, PIECE, 'essai')

    // La regle du fichier. Le journal EST la trace de l'ouverture : rien
    // d'autre ne dira jamais que ce document a ete regarde.
    expect(base.appels.indexOf('journaliser')).toBeLessThan(base.appels.indexOf('cleScellee'))
    expect(base.appels.indexOf('journaliser')).toBeLessThan(base.appels.indexOf('telecharger'))
  }, 30_000)

  test('le journal recoit le dossier de la piece', async () => {
    await ouvrirPiecePourLAgence(base, PIECE, 'essai')
    expect(base.entrees).toEqual([{ dossierId: DOSSIER, pieceId: PIECE }])
  }, 30_000)
})

describe('ce qui doit refuser', () => {
  let base: BaseDeTest

  beforeEach(async () => {
    base = new BaseDeTest()
    ranger(base, await pdfDEssai())
  })

  test('un journal en panne ferme la piece', async () => {
    base.echecJournal = true
    const resultat = await ouvrirPiecePourLAgence(base, PIECE, 'essai')

    expect(resultat).toMatchObject({ ouverte: false })
    // Et surtout : aucun octet n'est meme alle chercher la cle.
    expect(base.appels).not.toContain('cleScellee')
    expect(base.appels).not.toContain('telecharger')
  })

  test('une piece hors de portee ne journalise rien', async () => {
    // `piece()` rend `null` quand la RLS a refuse. Journaliser alors
    // remplirait le journal d'un dossier auquel on n'a pas acces.
    const resultat = await ouvrirPiecePourLAgence(
      base,
      '00000000-0000-0000-0000-000000000000',
      'essai',
    )

    expect(resultat).toMatchObject({ ouverte: false })
    expect(base.appels).toEqual(['piece'])
  })

  test('une cle absente ne rend pas les octets pour autant', async () => {
    base.cle = null
    const resultat = await ouvrirPiecePourLAgence(base, PIECE, 'essai')
    expect(resultat).toMatchObject({ ouverte: false })
  })

  test('un octet altere fait echouer plutot que rendre de la bouillie', async () => {
    const scelle = base.octets!
    scelle.writeUInt8(scelle.readUInt8(40) ^ 0x01, 40)

    const resultat = await ouvrirPiecePourLAgence(base, PIECE, 'essai')
    expect(resultat).toMatchObject({ ouverte: false })
  })

  test('une cle maitresse changee n ouvre plus rien', async () => {
    const vraie = process.env.CLE_MAITRESSE
    process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')

    // Le point qui porte l'ADR 0003 : la base sans la KEK ne donne rien.
    const resultat = await ouvrirPiecePourLAgence(base, PIECE, 'essai')
    expect(resultat).toMatchObject({ ouverte: false })

    process.env.CLE_MAITRESSE = vraie
  })

  test('un contenu que le moteur refuse ne repart pas en clair', async () => {
    const bouillie = Buffer.from('%PDF-1.7 ceci n est pas un document', 'latin1')
    ranger(base, bouillie)

    const resultat = await ouvrirPiecePourLAgence(base, PIECE, 'essai')

    // Rendre l'original faute de savoir le rasteriser donnerait a l'agence
    // exactement ce qu'on s'emploie a ne pas lui donner.
    expect(resultat).toMatchObject({ ouverte: false })
    if (resultat.ouverte) throw new Error('aurait du refuser')
    expect(resultat.raison).not.toContain('PDF-1.7')
  }, 30_000)

  test('les raisons ne renseignent sur rien', async () => {
    base.echecJournal = true
    const refuse = await ouvrirPiecePourLAgence(base, PIECE, 'essai')
    const inconnue = await ouvrirPiecePourLAgence(new BaseDeTest(), 'aucune', 'essai')

    if (refuse.ouverte || inconnue.ouverte) throw new Error('auraient du refuser')

    // Un refus d'acces et une piece inexistante se lisent pareil : distinguer
    // les deux dirait ce qui existe.
    expect(refuse.raison).toBe(inconnue.raison)
    expect(refuse.raison).not.toMatch(/storage|supabase|sql|journal/i)
  })
})

describe('le filigrane', () => {
  test('il nomme la personne et la date', () => {
    const texte = filigranePour('marie@agence-lyon3.fr', new Date('2026-09-03T10:00:00Z'))

    // Il nomme quelqu'un, et c'est ce qui en fait un dissuasif : une capture
    // qui circule designe une personne.
    expect(texte).toContain('marie@agence-lyon3.fr')
    expect(texte).toContain('03/09/2026')
    expect(texte).toContain('Cloison')
  })
})
