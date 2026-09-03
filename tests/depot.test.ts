import { randomBytes } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { deposer, retirerPiece, type DepotBase, type PieceAInscrire } from '@/lib/coffre/depot'
import { depuisBytea, versBytea } from '@/lib/coffre/depot-supabase'
import { nouvelleCle, ouvrir, sceller } from '@/lib/coffre/enveloppe'

/**
 * Le depot d'une piece, sans Supabase.
 *
 * Ce qui se teste ici est l'enchainement, pas le branchement : l'ordre des
 * etapes, ce qui reste apres un echec, et la course sur la cle du dossier.
 * Ce sont les trois endroits ou une erreur ne se verrait pas tout de suite.
 */

const DOSSIER = '33333333-3333-3333-3333-333333333333'

/** Un vrai debut de PDF, puisque le module refuse tout le reste. */
function pdf(texte = 'Bulletin de paie, mars.'): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.from(texte, 'utf8')])
}

/**
 * Une base en memoire, capable d'echouer ou de perdre une course.
 *
 * Elle note l'ordre des appels : une partie de ce qu'on verifie est
 * precisement cet ordre.
 */
class BaseDeTest implements DepotBase {
  cles = new Map<string, Buffer>()
  objets = new Map<string, Buffer>()
  lignes: PieceAInscrire[] = []
  entrees: { dossierId: string; action: string; pieceId: string }[] = []
  appels: string[] = []

  echecTeleversement = false
  echecInscription = false
  echecJournal = false

  /** Une cle deja scellee, posee par un autre depot juste avant le notre. */
  concurrente: Buffer | null = null

  async cleScellee(dossierId: string) {
    this.appels.push('cleScellee')
    return this.cles.get(dossierId) ?? null
  }

  async poserCleScellee(dossierId: string, scellee: Buffer): Promise<'posee' | 'deja' | 'echec'> {
    this.appels.push('poserCleScellee')

    if (this.concurrente) {
      // Quelqu'un a pose la sienne entre notre lecture et notre ecriture.
      this.cles.set(dossierId, this.concurrente)
      this.concurrente = null
      return 'deja' as const
    }

    if (this.cles.has(dossierId)) return 'deja' as const
    this.cles.set(dossierId, scellee)
    return 'posee' as const
  }

  async televerser(chemin: string, scelle: Buffer) {
    this.appels.push('televerser')
    if (this.echecTeleversement) return false
    this.objets.set(chemin, scelle)
    return true
  }

  async retirerObjet(chemin: string) {
    this.appels.push('retirerObjet')
    this.objets.delete(chemin)
  }

  async inscrirePiece(piece: PieceAInscrire) {
    this.appels.push('inscrirePiece')
    if (this.echecInscription) return null
    this.lignes.push(piece)
    return `piece-${this.lignes.length}`
  }

  async journaliser(dossierId: string, action: 'piece_deposee' | 'piece_retiree', pieceId: string) {
    this.appels.push('journaliser')
    if (this.echecJournal) return false
    this.entrees.push({ dossierId, action, pieceId })
    return true
  }

  /** Vrai quand le dossier est parti : la RLS ne supprime plus rien. */
  dossierTransmis = false

  async pieceDeposee(pieceId: string) {
    this.appels.push('pieceDeposee')
    const index = Number(pieceId.replace('piece-', '')) - 1
    const ligne = this.lignes[index]
    return ligne ? { dossierId: ligne.dossierId, chemin: ligne.chemin } : null
  }

  async supprimerPiece(pieceId: string) {
    this.appels.push('supprimerPiece')
    if (this.dossierTransmis) return false
    const index = Number(pieceId.replace('piece-', '')) - 1
    if (!this.lignes[index]) return false
    this.lignes.splice(index, 1)
    return true
  }
}

/** La cle du dossier, ouverte comme le ferait le serveur. */
function cleDuDossier(base: BaseDeTest): Buffer {
  const scellee = base.cles.get(DOSSIER)
  if (!scellee) throw new Error('aucune cle posee')
  return ouvrir(scellee, Buffer.from(process.env.CLE_MAITRESSE ?? '', 'base64'))
}

// La cle maitresse vit chez Vercel en production. Ici elle est tiree une fois
// pour le fichier : les tests ouvrent ce que le depot a scelle, donc ils en ont
// besoin, exactement comme le serveur.
beforeAll(() => {
  process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
})

describe('deposer', () => {
  let base: BaseDeTest

  beforeEach(() => {
    base = new BaseDeTest()
  })

  test('une piece acceptee est scellee, rangee et inscrite', async () => {
    const contenu = pdf()
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', contenu)

    expect(resultat).toMatchObject({ depose: true })
    expect(base.lignes).toHaveLength(1)
    expect(base.lignes[0]).toMatchObject({
      dossierId: DOSSIER,
      nature: 'bulletin_paie',
      typeReel: 'application/pdf',
      tailleOctets: contenu.length,
    })
  })

  test('les octets ranges ne sont pas le clair, et se rouvrent', async () => {
    const contenu = pdf('Bulletin de paie, mars, net imposable 2140 euros.')
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', contenu)
    if (!resultat.depose) throw new Error(resultat.raison)

    const range = base.objets.get(resultat.chemin)
    if (!range) throw new Error('rien de range')

    // Ce que Supabase recevrait. Le mot ne doit pas s'y trouver.
    expect(range.includes(contenu)).toBe(false)
    expect(range.toString('latin1')).not.toContain('imposable')
    expect(ouvrir(range, cleDuDossier(base))).toEqual(contenu)
  })

  test('le chemin est dans le dossier et ne reprend rien du depot', async () => {
    const resultat = await deposer(base, DOSSIER, 'piece_identite', pdf())
    if (!resultat.depose) throw new Error(resultat.raison)

    // La contrainte `chemin_dans_le_dossier` dit la meme chose en base.
    expect(resultat.chemin.startsWith(`${DOSSIER}/`)).toBe(true)

    const suite = resultat.chemin.slice(DOSSIER.length + 1)
    expect(suite).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('deux depots ne partagent pas un chemin', async () => {
    const chemins = new Set<string>()
    for (let i = 0; i < 20; i += 1) {
      const resultat = await deposer(base, DOSSIER, 'bulletin_paie', pdf(`piece ${i}`))
      if (!resultat.depose) throw new Error(resultat.raison)
      chemins.add(resultat.chemin)
    }
    expect(chemins.size).toBe(20)
  })
})

describe('la cle du dossier', () => {
  let base: BaseDeTest

  beforeEach(() => {
    base = new BaseDeTest()
  })

  test('elle n est creee qu une fois pour plusieurs depots', async () => {
    await deposer(base, DOSSIER, 'bulletin_paie', pdf('un'))
    await deposer(base, DOSSIER, 'avis_imposition', pdf('deux'))

    expect(base.cles.size).toBe(1)
    expect(base.appels.filter((a) => a === 'poserCleScellee')).toHaveLength(1)
  })

  test('toutes les pieces d un dossier s ouvrent avec la meme cle', async () => {
    const premier = await deposer(base, DOSSIER, 'bulletin_paie', pdf('un'))
    const second = await deposer(base, DOSSIER, 'avis_imposition', pdf('deux'))
    if (!premier.depose || !second.depose) throw new Error('depot refuse')

    const cle = cleDuDossier(base)
    expect(ouvrir(base.objets.get(premier.chemin)!, cle).toString('utf8')).toContain('un')
    expect(ouvrir(base.objets.get(second.chemin)!, cle).toString('utf8')).toContain('deux')
  })

  test('la course perdue scelle avec la cle gagnante, jamais avec la sienne', async () => {
    // Le cas qui justifie tout le detour. Deux depots simultanes sur un
    // dossier neuf tirent chacun une cle ; une seule est rangee. Sceller avec
    // la perdante donnerait une piece que plus rien n'ouvrirait, et rien ne le
    // signalerait avant que l'agence essaie de la lire.
    const gagnante = nouvelleCle()
    base.concurrente = sceller(gagnante, Buffer.from(process.env.CLE_MAITRESSE!, 'base64'))

    const contenu = pdf('depose pendant la course')
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', contenu)
    if (!resultat.depose) throw new Error(resultat.raison)

    expect(ouvrir(base.objets.get(resultat.chemin)!, gagnante)).toEqual(contenu)

    // Et la cle rangee est restee celle du gagnant : le perdant n'a rien
    // ecrase en repassant.
    expect(cleDuDossier(base)).toEqual(gagnante)
  })

  test('une cle impossible a obtenir arrete le depot avant tout envoi', async () => {
    base.poserCleScellee = async (): Promise<'echec'> => 'echec'

    await expect(deposer(base, DOSSIER, 'bulletin_paie', pdf())).rejects.toThrow(/cle du dossier/)
    expect(base.objets.size).toBe(0)
    expect(base.appels).not.toContain('televerser')
  })
})

describe('ce qui reste apres un echec', () => {
  let base: BaseDeTest

  beforeEach(() => {
    base = new BaseDeTest()
  })

  test('un contenu refuse ne touche jamais la base', async () => {
    // Aucun appel, pas meme la lecture de la cle : un fichier hostile ne doit
    // pas pouvoir declencher la creation d'une cle de dossier.
    const heic = Buffer.alloc(64)
    heic.writeUInt32BE(32, 0)
    heic.write('ftypheic', 4, 'latin1')

    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', heic)

    expect(resultat).toMatchObject({ depose: false })
    expect(base.appels).toEqual([])
    expect(base.cles.size).toBe(0)
  })

  test('un televersement rate ne laisse aucune ligne', async () => {
    base.echecTeleversement = true
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', pdf())

    expect(resultat).toMatchObject({ depose: false })
    expect(base.lignes).toEqual([])
    expect(base.appels).not.toContain('inscrirePiece')
  })

  test('une inscription ratee retire les octets deja envoyes', async () => {
    base.echecInscription = true
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', pdf())

    expect(resultat).toMatchObject({ depose: false })
    expect(base.objets.size).toBe(0)
    expect(base.appels).toEqual([
      'cleScellee',
      'poserCleScellee',
      'televerser',
      'inscrirePiece',
      'retirerObjet',
    ])
    expect(base.entrees).toEqual([])
  })

  test('les octets partent avant la ligne, jamais l inverse', async () => {
    await deposer(base, DOSSIER, 'bulletin_paie', pdf())

    // Une ligne sans objet ferait voir a l'agence une piece qui ne s'ouvre
    // pas. Un objet sans ligne est invisible et chiffre.
    expect(base.appels.indexOf('televerser')).toBeLessThan(base.appels.indexOf('inscrirePiece'))
  })

  test('la raison rendue ne dit rien de la panne', async () => {
    base.echecTeleversement = true
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', pdf())

    if (resultat.depose) throw new Error('aurait du echouer')
    expect(resultat.raison).not.toMatch(/storage|supabase|sql/i)
  })
})

describe('le journal', () => {
  let base: BaseDeTest

  beforeEach(() => {
    base = new BaseDeTest()
  })

  test('un depot reussi laisse une entree', async () => {
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', pdf())
    if (!resultat.depose) throw new Error(resultat.raison)

    expect(base.entrees).toEqual([
      { dossierId: DOSSIER, action: 'piece_deposee', pieceId: resultat.pieceId },
    ])
  })

  test('le journal vient apres l inscription, jamais avant', async () => {
    await deposer(base, DOSSIER, 'bulletin_paie', pdf())
    // Inscrire un acces a une piece qui n'existe pas encore ferait echouer
    // `journaliser`, qui verifie que la piece appartient bien au dossier.
    expect(base.appels.indexOf('inscrirePiece')).toBeLessThan(base.appels.indexOf('journaliser'))
  })

  test('un journal en panne n annule pas le depot', async () => {
    base.echecJournal = true
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', pdf())

    // La ligne `pieces` est deja la trace du depot. Defaire un depot reussi
    // parce qu'on n'a pas su l'ecrire deux fois couterait a la personne une
    // piece qu'elle croyait posee.
    expect(resultat).toMatchObject({ depose: true })
    expect(base.lignes).toHaveLength(1)
    expect(base.objets.size).toBe(1)
  })

  test('un depot refuse ne journalise rien', async () => {
    base.echecTeleversement = true
    await deposer(base, DOSSIER, 'bulletin_paie', pdf())
    expect(base.entrees).toEqual([])
  })
})

describe('retirer une piece', () => {
  let base: BaseDeTest

  beforeEach(async () => {
    base = new BaseDeTest()
    const resultat = await deposer(base, DOSSIER, 'bulletin_paie', pdf())
    if (!resultat.depose) throw new Error(resultat.raison)
    base.appels = []
    base.entrees = []
  })

  test('elle disparait de la table et du stockage, et le journal le sait', async () => {
    const resultat = await retirerPiece(base, 'piece-1')

    expect(resultat).toEqual({ retiree: true })
    expect(base.lignes).toHaveLength(0)
    expect(base.objets.size).toBe(0)
    expect(base.entrees).toEqual([
      { dossierId: DOSSIER, action: 'piece_retiree', pieceId: 'piece-1' },
    ])
  })

  test('le journal precede la suppression, sinon il ne pourrait plus rien inscrire', async () => {
    await retirerPiece(base, 'piece-1')

    // `journaliser` relit la piece dans `pieces` pour verifier qu'elle
    // appartient au dossier. Apres la suppression, il n'y aurait plus rien a
    // relire, et le retrait serait la seule action du coffre sans trace.
    expect(base.appels.indexOf('journaliser')).toBeLessThan(base.appels.indexOf('supprimerPiece'))
  })

  test('la ligne part avant les octets, jamais l inverse', async () => {
    await retirerPiece(base, 'piece-1')
    expect(base.appels.indexOf('supprimerPiece')).toBeLessThan(base.appels.indexOf('retirerObjet'))
  })

  test('un dossier transmis garde ses pieces, octets compris', async () => {
    base.dossierTransmis = true
    const resultat = await retirerPiece(base, 'piece-1')

    // C'est la RLS qui refuse, en ne supprimant rien. Les octets ne doivent
    // pas etre touches : l'agence decide sur cette piece.
    expect(resultat).toMatchObject({ retiree: false })
    expect(base.lignes).toHaveLength(1)
    expect(base.objets.size).toBe(1)
    expect(base.appels).not.toContain('retirerObjet')
  })

  test('une piece hors de portee ne journalise rien', async () => {
    const resultat = await retirerPiece(base, 'piece-99')
    expect(resultat).toMatchObject({ retiree: false })
    expect(base.entrees).toEqual([])
    expect(base.lignes).toHaveLength(1)
  })

  test('un journal en panne empeche le retrait', async () => {
    base.echecJournal = true
    const resultat = await retirerPiece(base, 'piece-1')

    // Meme regle qu'a l'ouverture : on ne fait pas ce qu'on ne peut pas inscrire.
    expect(resultat).toMatchObject({ retiree: false })
    expect(base.lignes).toHaveLength(1)
    expect(base.objets.size).toBe(1)
  })
})

describe('le codage du bytea', () => {
  test('une cle fait l aller-retour sans changer', () => {
    for (let i = 0; i < 50; i += 1) {
      const cle = nouvelleCle()
      expect(depuisBytea(versBytea(cle))).toEqual(cle)
    }
  })

  test('le prefixe attendu par PostgREST est bien la', () => {
    expect(versBytea(Buffer.from([0x00, 0xff, 0x10]))).toBe(String.raw`\x00ff10`)
  })

  test('une valeur inutilisable rend null plutot qu un tampon faux', () => {
    // Une chaine mal decodee donnerait une cle de la mauvaise taille, donc un
    // chiffrement qui refuse de s'ouvrir bien plus tard, loin d'ici.
    for (const valeur of [null, undefined, 42, {}, '', String.raw`\xabc`, String.raw`\xzz`]) {
      expect(depuisBytea(valeur)).toBeNull()
    }
  })
})
