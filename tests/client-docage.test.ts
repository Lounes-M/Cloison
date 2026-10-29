import { PDFDocument } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { creerClientDocage, etatDocage } from '@/lib/signature/client-docage'

const id = '11111111-1111-4111-8111-111111111111'
const document = '22222222-2222-4222-8222-222222222222'
const membre = '33333333-3333-4333-8333-333333333333'
const reference = '44444444-4444-4444-8444-444444444444'
const config = {
  environnement: 'sandbox' as const,
  courriel: 'signature@example.test',
  cleApi: 'cle-fictive',
  autoriserMutations: true,
}
const json = (o: unknown) => Response.json(o)
const transaction = (changement: Record<string, unknown> = {}) => ({
  Id: id,
  GlobalStatus: 5,
  IsTest: true,
  ExternalId: reference,
  TransactionMembers: [{ Id: membre, MemberRole: 0 }],
  TransactionFiles: [{ Id: document }],
  ...changement,
})
async function pdfA4() {
  const doc = await PDFDocument.create()
  doc.addPage([595.28, 841.89])
  return Buffer.from(await doc.save())
}
const corps = (appel: unknown[]) => JSON.parse(String((appel[1] as RequestInit).body))
afterEach(() => vi.restoreAllMocks())

describe('Etats Docage', () => {
  it.each([
    [0, 'draft'],
    [3, 'ongoing'],
    [4, 'ongoing'],
    [5, 'done'],
    ['Signed', 'done'],
    [6, 'expired'],
    [7, 'declined'],
    [8, 'canceled'],
  ])('traduit %j en %s', (valeur, etat) => expect(etatDocage(valeur)).toBe(etat))
  it.each([9, 'inconnu', null, '__proto__'])('refuse %j', (v) => expect(etatDocage(v)).toBeNull())
})

describe('Client API Docage', () => {
  it('authentifie en Basic sur l origine officielle et cree une transaction de test', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(id))
    const expiration = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    expect(await creerClientDocage(config, transport).creer({ reference, expiration })).toEqual({
      id,
      status: 'draft',
    })
    const [url, init] = transport.mock.calls[0]!
    expect(url).toBe('https://api.docage.com/Transactions')
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('signature@example.test:cle-fictive').toString('base64')}`,
    )
    expect(corps(transport.mock.calls[0]!)).toMatchObject({ externalId: reference, isTest: true })
  })

  it('refuse toute ecriture sans mutations autorisees', async () => {
    const transport = vi.fn<typeof fetch>()
    await expect(
      creerClientDocage({ ...config, autoriserMutations: false }, transport).activer(id),
    ).rejects.toThrow(/^Operation Docage indisponible$/)
    expect(transport).not.toHaveBeenCalled()
  })

  it('refuse une transaction dont le marquage de test ne correspond pas', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(transaction({ IsTest: false })))
    await expect(creerClientDocage(config, transport).lirePourRapprochement(id)).rejects.toThrow()
  })

  it('rapproche avec la reference externe et l etat commun', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(transaction()))
    expect(await creerClientDocage(config, transport).lirePourRapprochement(id)).toEqual({
      id,
      external_id: reference,
      status: 'done',
    })
  })

  it('place le champ en comptant y depuis le bas de la page, en OTP SMS', async () => {
    const pdf = await pdfA4()
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(pdf.toString('base64')))
      .mockResolvedValueOnce(json(membre))
      .mockResolvedValueOnce(json('55555555-5555-4555-8555-555555555555'))
    const r = await creerClientDocage(config, transport).ajouterSignataire(id, {
      prenom: 'Alice',
      nom: 'Exemple',
      email: 'alice@example.test',
      telephone: '+33600000000',
      document,
      page: 1,
      x: 60,
      y: 700,
    })
    expect(r).toEqual({ id: membre })
    expect(corps(transport.mock.calls[1]!)).toMatchObject({
      transactionId: id,
      signMode: 0,
      memberRole: 0,
      mobile: '+33600000000',
    })
    expect(corps(transport.mock.calls[2]!)).toEqual({
      transactionMemberId: membre,
      transactionFileId: document,
      coordinates: `60,${Math.round(841.89 - 700 - 37)},85,37`,
      pages: '1',
    })
  })

  it('recupere l acte signe et la preuve en base64, et refuse un autre contenu', async () => {
    const pdf = await pdfA4()
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(transaction()))
      .mockResolvedValueOnce(json({ FileContent: pdf.toString('base64') }))
      .mockResolvedValueOnce(json(pdf.toString('base64')))
    const pieces = await creerClientDocage(config, transport).recupererPieces(id, document, [
      membre,
    ])
    expect(pieces.acte.pdf.equals(pdf)).toBe(true)
    expect(pieces.preuves).toHaveLength(1)
    expect(pieces.preuves[0]?.signataire).toBe(membre)
    expect(transport.mock.calls.map((c) => c[0])).toEqual([
      `https://api.docage.com/Transactions/ById/${id}`,
      `https://api.docage.com/TransactionFiles/DownloadDocument/${document}`,
      `https://api.docage.com/Transactions/DownloadProofFile/${id}/PDF`,
    ])

    const faux = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(transaction()))
      .mockResolvedValueOnce(json(Buffer.from('pas un pdf').toString('base64')))
    await expect(
      creerClientDocage(config, faux).recupererPieces(id, document, [membre]),
    ).rejects.toThrow()
  })

  it('ne recupere rien tant que la transaction n est pas signee', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(transaction({ GlobalStatus: 3 })))
    await expect(
      creerClientDocage(config, transport).recupererPieces(id, document, [membre]),
    ).rejects.toThrow()
    expect(transport).toHaveBeenCalledOnce()
  })
})
