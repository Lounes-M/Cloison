import { describe, expect, test } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  ActeIncomplet,
  euros,
  eurosEnLettres,
  redigerActe,
  type DonneesActe,
} from '@/lib/acte/modele-cautionnement'
import { genererActePdf, TexteNonImprimable } from '@/lib/acte/pdf-cautionnement'
import { verifierActe } from '../workers/validation-acte'

// Donnees fictives. La mention est saisie ici pour le test, comme le ferait le garant.
const MENTION_SOLIDAIRE =
  'Je m’engage en qualité de caution solidaire à payer au bailleur ce que lui doit le locataire en cas de défaillance de celui-ci, dans la limite de douze mille euros (12 000 €), et je renonce aux bénéfices de discussion et de division.'

const base = (): DonneesActe => ({
  caution: {
    civilite: 'madame',
    prenom: 'Camille',
    nom: 'Exemple',
    naissanceLe: '1970-05-01',
    naissanceLieu: 'Lyon',
    adresse: '1 rue de l’Essai, 69001 Lyon',
  },
  locataire: 'Alex Fictif',
  bailleur: { nom: 'SCI Démonstration', adresse: '2 place du Test, 75001 Paris' },
  mandataire: 'Agence Témoin',
  logement: '3 allée des Modèles, appartement 12, 75011 Paris',
  loyer: {
    horsChargesCents: 95000,
    chargesCents: 8050,
    periodicite: 'mois',
    revisionLe: '2026-11-01',
    irlTrimestre: 2,
    irlAnnee: 2026,
  },
  engagement: { solidaire: true, couvre: 'loyer_charges', plafondCents: 1200000, jusquAu: null },
  mention: { texte: MENTION_SOLIDAIRE, saisieLe: '2026-10-20T09:30:00+02:00' },
  fait: { lieu: 'Paris', le: '2026-10-26' },
})

const texteDe = (d: DonneesActe) =>
  redigerActe(d)
    .blocs.map((b) =>
      'texte' in b ? b.texte : 'valeur' in b ? `${b.libelle} ${b.valeur}` : b.lignes.join(' '),
    )
    .join('\n')

describe('redaction', () => {
  test('montants en chiffres et en lettres', () => {
    expect(euros(1200000)).toBe('12 000 €')
    expect(euros(8050)).toBe('80,50 €')
    expect(eurosEnLettres(95000)).toBe('neuf-cent-cinquante euros')
    expect(eurosEnLettres(101)).toBe('un euro et un centime')
  })

  test('caution solidaire, duree indeterminee : rubriques du modele officiel', () => {
    const t = texteDe(base())
    expect(t).toContain('Je soussignée Camille Exemple, née le 1er mai 1970 à Lyon')
    expect(t).toContain('déclare me porter caution solidaire de Alex Fictif')
    expect(t).toContain('neuf-cent-cinquante euros, soit 950 €, hors charges, payable par mois')
    expect(t).toContain('provision sur charges de 80,50 € par mois')
    expect(t).toContain('révisé annuellement tous les 1er novembre')
    expect(t).toContain('2e trimestre 2026')
    expect(t).toContain('des charges, des réparations')
    expect(t).toContain('douze-mille euros (12 000 €)')
    expect(t).toContain('je renonce aux bénéfices de discussion et de division')
    expect(t).toContain('durée indéterminée')
    expect(t).toContain('article 22-1 de la loi du 6 juillet 1989')
    expect(t).toContain('article 2297 du code civil')
    expect(t).toContain('Fait à Paris, le 26 octobre 2026.')
  })

  test('la mention est recopiee telle quelle, jamais redigee', () => {
    const blocs = redigerActe(base()).blocs.filter((b) => b.type === 'mention')
    expect(blocs).toHaveLength(1)
    expect(blocs[0]).toMatchObject({ texte: MENTION_SOLIDAIRE })
  })

  test('caution simple a duree determinee, loyer seul', () => {
    const d = base()
    d.caution.civilite = 'monsieur'
    d.engagement = {
      solidaire: false,
      couvre: 'loyer',
      plafondCents: 1200000,
      jusquAu: '2029-10-31',
    }
    d.mention.texte =
      'Je me porte caution et je paierai au bailleur ce que lui doit le locataire en cas de défaillance, dans la limite de douze mille euros (12 000 €).'
    const t = texteDe(d)
    expect(t).toContain('Je soussigné Camille Exemple, né le')
    expect(t).toContain('caution simple')
    expect(t).toContain('je conserve les bénéfices de discussion et de division')
    expect(t).toContain('jusqu’au 31 octobre 2029. Je ne peux pas le résilier avant cette date.')
    expect(t).not.toContain('des charges, des réparations')
  })

  test('nomme les autres cautions quand le bail en a plusieurs', () => {
    const d = { ...base(), coCautions: ['Dominique Second'] }
    expect(texteDe(d)).toContain('Autres cautions Dominique Second')
  })

  test.each([
    [
      'mention incomplete',
      (d: DonneesActe) => (d.mention.texte = 'x'.repeat(60)),
      'mention_incomplete',
    ],
    [
      'solidaire sans renonciation',
      (d: DonneesActe) =>
        (d.mention.texte =
          'Je me porte caution et je paierai ce que doit le locataire en cas de défaillance, dans la limite de douze mille euros (12 000 €).'),
      'mention_incomplete',
    ],
    [
      'plafond different de la mention',
      (d: DonneesActe) => (d.engagement.plafondCents = 1300000),
      'mention_plafond',
    ],
    ['fin avant la date', (d: DonneesActe) => (d.engagement.jusquAu = '2026-01-01'), 'dates'],
  ])('refuse : %s', (_nom, alterer, motif) => {
    const d = base()
    alterer(d)
    expect(() => redigerActe(d)).toThrow(ActeIncomplet)
    try {
      redigerActe(d)
    } catch (e) {
      expect((e as ActeIncomplet).motif).toBe(motif)
    }
  })
})

describe('PDF', () => {
  test('passe le controle des projets et place le champ dans la page', async () => {
    const { pdf, signature } = await genererActePdf(base())
    await expect(verifierActe(Buffer.from(pdf), signature)).resolves.toBeTruthy()
    const doc = await PDFDocument.load(pdf)
    expect(signature.page).toBe(doc.getPageCount())
    expect(doc.getPageCount()).toBeLessThanOrEqual(3)
    expect(doc.getTitle()).toBe('Acte de cautionnement solidaire, Camille Exemple')
  })

  test('memes donnees, memes octets', async () => {
    const a = await genererActePdf(base())
    const b = await genererActePdf(base())
    expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(true)
  })

  test('une longue mention reste lisible sur plusieurs lignes', async () => {
    const d = base()
    d.mention.texte = `${MENTION_SOLIDAIRE}\n${'Je confirme avoir lu le bail. '.repeat(40)}`
    const { pdf, signature } = await genererActePdf(d)
    await expect(verifierActe(Buffer.from(pdf), signature)).resolves.toBeTruthy()
  })

  test('refuse un caractere que le PDF ne sait pas ecrire, sans le remplacer', async () => {
    const d = base()
    d.mention.texte = `${MENTION_SOLIDAIRE} 中`
    await expect(genererActePdf(d)).rejects.toThrow(TexteNonImprimable)
  })
})

describe('colocation', () => {
  const coloc = (etendue: 'part' | 'loyer_entier'): DonneesActe => ({
    ...base(),
    colocation: { colocataires: 3, etendue },
    coCautions: ['Dominique Témoin'],
  })

  test('l acte nomme le colocataire garanti et reproduit l article 8-1', () => {
    const t = texteDe(coloc('part'))
    expect(t).toContain('Colocataire garanti Alex Fictif')
    expect(t).toContain('Le bail est une colocation de trois colocataires')
    expect(t).toContain('le colocataire pour lequel je me porte caution est Alex Fictif')
    expect(t).toContain('au titre de sa part du loyer et des charges')
    expect(t).not.toContain('clause de solidarité entre les colocataires')
    expect(t).toContain('VI de l’article 8-1 de la loi du 6 juillet 1989')
    expect(t).toContain('identifie nécessairement, sous peine de nullité, le colocataire')
    expect(t).toContain('Autres cautions Dominique Témoin')
  })

  test('bail solidaire : l engagement couvre la part des autres, dans la limite du plafond', () => {
    const t = texteDe(coloc('loyer_entier'))
    expect(t).toContain('clause de solidarité entre les colocataires')
    expect(t).toContain('y compris la part des autres colocataires')
    expect(t).not.toContain('au titre de sa part du loyer')
  })

  test('hors colocation, rien de tout cela', () => {
    const t = texteDe(base())
    expect(t).toContain('Locataire Alex Fictif')
    expect(t).not.toContain('colocation')
    expect(t).not.toContain('8-1')
  })

  test('le PDF de colocation passe le controle des actes', async () => {
    const { pdf } = await genererActePdf(coloc('loyer_entier'))
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(1)
  })

  test('garant commun : un seul acte nomme chacun et designe celui dont le depart y met fin', () => {
    const commun = (etendue: 'part' | 'loyer_entier'): DonneesActe => ({
      ...base(),
      colocation: { colocataires: 3, etendue, autresGarantis: ['Bob Essai', 'Chloé Essai'] },
    })
    const t = texteDe(commun('part'))
    expect(t).toContain('Colocataire désigné Alex Fictif')
    expect(t).toContain('Autres colocataires garantis Bob Essai ; Chloé Essai')
    expect(t).toContain('de Alex Fictif, Bob Essai et Chloé Essai, pour le bail')
    expect(t).toContain('dont je garantis trois par le présent acte')
    expect(t).toContain(
      'le colocataire pour lequel l’extinction de la solidarité met fin à mon engagement est Alex Fictif',
    )
    expect(t).toContain('y compris à l’égard des autres colocataires garantis')
    expect(t).toContain('au titre de leurs parts du loyer et des charges')
    expect(texteDe(commun('loyer_entier'))).toContain(
      'dont Alex Fictif, Bob Essai et Chloé Essai sont tenus à ce titre',
    )
  })

  test('une caution ne garantit pas plus de colocataires que le bail n en compte', () => {
    expect(() =>
      redigerActe({
        ...base(),
        colocation: {
          colocataires: 2,
          etendue: 'part',
          autresGarantis: ['Bob Essai', 'Chloé Essai'],
        },
      }),
    ).toThrow()
  })

  test('une colocation d une seule personne est refusee', () => {
    expect(() =>
      redigerActe({ ...base(), colocation: { colocataires: 1, etendue: 'part' } }),
    ).toThrow()
  })
})
