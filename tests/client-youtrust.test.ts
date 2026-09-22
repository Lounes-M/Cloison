import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { creerClientYoutrust } from '@/lib/signature/client-youtrust'
import {
  clientYoutrustConfigure,
  verificateurYoutrustConfigure,
} from '@/lib/signature/configuration-youtrust'

const id = '11111111-1111-4111-8111-111111111111'
const document = '22222222-2222-4222-8222-222222222222'
const signataire = '33333333-3333-4333-8333-333333333333'
const config = {
  environnement: 'sandbox' as const,
  cleApi: 'cle-fictive',
  autoriserMutations: true,
}
const pdf = Buffer.from('%PDF-1.7\ncontenu fictif de test')
const entree = {
  prenom: 'Alice',
  nom: 'Exemple',
  email: 'alice@example.test',
  telephone: '+33600000000',
  document,
  page: 1,
  x: 20,
  y: 40,
}
const reponse = (o: unknown) => Response.json(o)
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Client API Youtrust', () => {
  it.each(['sandbox', 'production'] as const)(
    'utilise uniquement l origine %s et minimise la reponse',
    async (environnement) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(reponse({ id, status: 'done', signers: [entree] }))
      expect(await creerClientYoutrust({ ...config, environnement }, transport).lire(id)).toEqual({
        id,
        status: 'done',
      })
      expect(transport).toHaveBeenCalledExactlyOnceWith(
        `https://api${environnement === 'sandbox' ? '-sandbox' : ''}.yousign.app/v3/signature_requests/${id}`,
        expect.objectContaining({
          method: 'GET',
          redirect: 'error',
          cache: 'no-store',
          headers: { Authorization: 'Bearer cle-fictive', Accept: 'application/json' },
        }),
      )
    },
  )
  it('realise le cycle API avec AES et OTP obligatoires', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reponse({ id, status: 'draft' }))
      .mockResolvedValueOnce(
        reponse({
          id: document,
          sha256: createHash('sha256').update(pdf).digest('hex'),
          nature: 'signable_document',
          content_type: 'application/pdf',
          is_protected: false,
          is_signed: false,
        }),
      )
      .mockResolvedValueOnce(
        reponse({
          id: signataire,
          signature_level: 'advanced_electronic_signature',
          signature_authentication_mode: 'otp_sms',
        }),
      )
      .mockResolvedValueOnce(reponse({ id, status: 'ongoing', signers: [entree] }))
      .mockResolvedValueOnce(reponse({ id, status: 'canceled' }))
    const client = creerClientYoutrust(config, transport)
    const expiration = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    expect(await client.creer({ reference: id, expiration })).toEqual({ id, status: 'draft' })
    expect(await client.ajouterDocument(id, pdf)).toHaveProperty('id', document)
    expect(await client.ajouterSignataire(id, entree)).toEqual({ id: signataire })
    expect(await client.activer(id)).toEqual({ id, status: 'ongoing' })
    expect(await client.annuler(id, 'errors_in_document')).toEqual({ id, status: 'canceled' })
    expect(JSON.parse(transport.mock.calls[0]![1]!.body as string)).toMatchObject({
      external_id: id,
      delivery_mode: 'email',
      signers_allowed_to_decline: true,
    })
    const formulaire = transport.mock.calls[1]![1]!.body as FormData
    expect(formulaire.get('nature')).toBe('signable_document')
    expect(await (formulaire.get('file') as Blob).text()).toBe(pdf.toString())
    expect(JSON.parse(transport.mock.calls[2]![1]!.body as string)).toMatchObject({
      signature_level: 'advanced_electronic_signature',
      signature_authentication_mode: 'otp_sms',
      info: { locale: 'fr' },
    })
    expect(transport.mock.calls.every(([, options]) => options?.method === 'POST')).toBe(true)
  })
  it('refuse les mutations par defaut sans appeler le reseau', async () => {
    const transport = vi.fn<typeof fetch>()
    const client = creerClientYoutrust({ environnement: 'sandbox', cleApi: 'fictive' }, transport)
    await expect(client.activer(id)).rejects.toThrow('Operation Youtrust indisponible')
    await expect(client.ajouterDocument(id, pdf)).rejects.toThrow()
    await expect(client.ajouterSignataire(id, entree)).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it('recupere tous les PDF seulement apres confirmation de la demande et des signataires', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        reponse({
          id,
          status: 'done',
          documents: [{ id: document, nature: 'signable_document' }],
          signers: [{ id: signataire, status: 'signed' }],
        }),
      )
      .mockResolvedValueOnce(new Response(pdf, { headers: { 'content-type': 'application/pdf' } }))
      .mockResolvedValueOnce(new Response(pdf, { headers: { 'content-type': 'application/pdf' } }))
    const pieces = await creerClientYoutrust(config, transport).recupererPieces(id, document, [
      signataire,
    ])
    expect(pieces.acte.pdf).toEqual(pdf)
    expect(pieces.preuves[0]?.sha256).toBe(createHash('sha256').update(pdf).digest('hex'))
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      `https://api-sandbox.yousign.app/v3/signature_requests/${id}`,
      `https://api-sandbox.yousign.app/v3/signature_requests/${id}/documents/${document}/download`,
      `https://api-sandbox.yousign.app/v3/signature_requests/${id}/signers/${signataire}/audit_trails/download`,
    ])
  })
  it.each([
    { status: 'ongoing' },
    { id: document },
    { documents: [] },
    { signers: [] },
    { signers: [{ id: signataire, status: 'initiated' }] },
    {
      signers: [
        { id: signataire, status: 'signed' },
        { id: document, status: 'signed' },
      ],
    },
  ])('refuse des pieces non rattachees ou incompletes %#', async (changement) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      reponse({
        id,
        status: 'done',
        documents: [{ id: document, nature: 'signable_document' }],
        signers: [{ id: signataire, status: 'signed' }],
        ...changement,
      }),
    )
    await expect(
      creerClientYoutrust(config, transport).recupererPieces(id, document, [signataire]),
    ).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it.each([301, 400, 401, 403, 404, 429, 500, 504])(
    'ne rejoue pas un POST HTTP %s',
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('details confidentiels', { status }))
      await expect(creerClientYoutrust(config, transport).activer(id)).rejects.toThrow(
        /^Operation Youtrust indisponible$/,
      )
      expect(transport).toHaveBeenCalledTimes(1)
    },
  )
  it('masque les erreurs de transport et de validation sans les rejouer', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('secret prive'))
    await expect(creerClientYoutrust(config, transport).activer(id)).rejects.toThrow(
      /^Operation Youtrust indisponible$/,
    )
    await expect(
      creerClientYoutrust(config, transport).ajouterSignataire(id, {
        ...entree,
        email: 'secret invalide',
      }),
    ).rejects.toThrow(/^Operation Youtrust indisponible$/)
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it.each(['../voisin', id + '?secret=x', 'https://evil.test'])(
    'refuse les identifiants %s avant le reseau',
    async (id) => {
      const transport = vi.fn<typeof fetch>()
      await expect(creerClientYoutrust(config, transport).lire(id)).rejects.toThrow()
      expect(transport).not.toHaveBeenCalled()
    },
  )
  it.each([
    () => new Response('a'.repeat(1048577), { headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { headers: { 'content-type': 'text/html' } }),
    () =>
      new Response('{}', {
        headers: { 'content-type': 'application/json', 'content-length': '-1' },
      }),
    () => new Response(Buffer.from([255]), { headers: { 'content-type': 'application/json' } }),
    () => reponse({ id: document, status: 'done' }),
  ])('refuse les reponses invalides ou excessives %#', async (fabrique) => {
    await expect(
      creerClientYoutrust(config, vi.fn<typeof fetch>().mockResolvedValue(fabrique())).lire(id),
    ).rejects.toThrow()
  })
  it('refuse un depot dont le fournisseur a change le document', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      reponse({
        id: document,
        sha256: '0'.repeat(64),
        nature: 'signable_document',
        content_type: 'application/pdf',
        is_protected: false,
        is_signed: false,
      }),
    )
    await expect(creerClientYoutrust(config, transport).ajouterDocument(id, pdf)).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('fige la selection de preuves avant le premier await', async () => {
    const selection = [signataire]
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith(id)) {
        selection[0] = '../autre'
        return reponse({
          id,
          status: 'done',
          documents: [{ id: document, nature: 'signable_document' }],
          signers: [{ id: signataire, status: 'signed' }],
        })
      }
      return new Response(pdf, { headers: { 'content-type': 'application/pdf' } })
    })
    expect(
      (await creerClientYoutrust(config, transport).recupererPieces(id, document, selection))
        .preuves[0]?.signataire,
    ).toBe(signataire)
    expect(transport.mock.calls.every(([url]) => !String(url).includes('autre'))).toBe(true)
  })
  it('annule un corps bloque lorsque le delai expire', async () => {
    const controle = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controle.signal)
    const annuler = vi.fn()
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          pull() {
            controle.abort()
          },
          cancel: annuler,
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    )
    await expect(creerClientYoutrust(config, transport).lire(id)).rejects.toThrow()
    expect(annuler).toHaveBeenCalled()
  })
  it('refuse une redirection deja suivie', async () => {
    const retour = reponse({ id, status: 'done' })
    Object.defineProperty(retour, 'redirected', { value: true })
    await expect(
      creerClientYoutrust(config, vi.fn<typeof fetch>().mockResolvedValue(retour)).lire(id),
    ).rejects.toThrow()
  })
  it.each(['HTML prive', '%PDF-' + 'a'.repeat(20 * 1024 * 1024)])(
    'ne restitue pas de paquet si le PDF est invalide %#',
    async (contenu) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          reponse({
            id,
            status: 'done',
            documents: [{ id: document, nature: 'signable_document' }],
            signers: [{ id: signataire, status: 'signed' }],
          }),
        )
        .mockResolvedValueOnce(
          new Response(contenu, { headers: { 'content-type': 'application/pdf' } }),
        )
      await expect(
        creerClientYoutrust(config, transport).recupererPieces(id, document, [signataire]),
      ).rejects.toThrow()
      expect(transport).toHaveBeenCalledTimes(2)
    },
  )
  it('refuse les environnements absents et laisse les mutations fermees', async () => {
    vi.stubEnv('YOUTRUST_ENVIRONMENT', '')
    expect(() => clientYoutrustConfigure()).toThrow('Configuration Youtrust indisponible')
    vi.stubEnv('YOUTRUST_ENVIRONMENT', 'sandbox')
    vi.stubEnv('YOUTRUST_API_KEY', 'fictive')
    vi.stubEnv('YOUTRUST_MUTATIONS_ENABLED', 'TRUE')
    await expect(clientYoutrustConfigure().activer(id)).rejects.toThrow()
    vi.stubEnv('YOUTRUST_WEBHOOK_SECRET', '')
    expect(() => verificateurYoutrustConfigure()).toThrow()
  })
})
