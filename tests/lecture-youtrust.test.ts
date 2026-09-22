import { afterEach, describe, expect, it, vi } from 'vitest'
import { lireYoutrust } from '../scripts/lire-youtrust.mjs'

const choix = { environnement: 'sandbox', transaction: '11111111-1111-4111-8111-111111111111' }
const cle = 'apikey_fictive_sans_acces'
const objet = { id: choix.transaction, status: 'done' }
const json = (valeur: unknown = objet) =>
  new Response(JSON.stringify(valeur), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
afterEach(() => vi.restoreAllMocks())

describe('Lecture Youtrust bornee et sans mutation', () => {
  it.each(['sandbox', 'production'])(
    'effectue un seul GET sur %s et ne restitue que l etat',
    async (environnement) => {
      const requete = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          ...objet,
          participants: [{ email: 'prive@example.test', url: 'https://secret.example.test' }],
          metadata: { secret: cle },
        }),
      )
      expect(await lireYoutrust({ ...choix, environnement }, cle, requete)).toEqual({
        etat: 'done',
      })
      expect(requete).toHaveBeenCalledExactlyOnceWith(
        `https://api${environnement === 'sandbox' ? '-sandbox' : ''}.yousign.app/v3/signature_requests/${choix.transaction}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
          cache: 'no-store',
          redirect: 'error',
          signal: expect.any(AbortSignal),
        },
      )
    },
  )
  it.each([
    'draft',
    'approval',
    'ongoing',
    'paused',
    'rejected',
    'declined',
    'canceled',
    'expired',
    'deleted',
    'done',
  ])('conserve l etat %s sans le transformer en preuve de signature', async (status) => {
    expect(
      await lireYoutrust(
        choix,
        cle,
        vi.fn<typeof fetch>().mockResolvedValue(json({ ...objet, status })),
      ),
    ).toEqual({ etat: status })
  })
  it.each([
    { ...choix, environnement: 'test' },
    { ...choix, environnement: 'https://evil.example.test' },
    { ...choix, transaction: 'tx_../autre' },
    { ...choix, transaction: 'tx_id?secret=1' },
    { ...choix, transaction: 'tx_id/../files' },
    { ...choix, transaction: `tx_${'a'.repeat(193)}` },
    { ...choix, url: 'https://evil.example.test' },
    { ...choix, method: 'POST' },
  ])('refuse une selection invalide sans requete %#', async (selection) => {
    const requete = vi.fn<typeof fetch>()
    await expect(lireYoutrust(selection, cle, requete)).rejects.toThrow(
      'Lecture Youtrust indisponible.',
    )
    expect(requete).not.toHaveBeenCalled()
  })
  it.each(['', 'a\nb', 'a\rb', ' a', 'é', 'a'.repeat(1025)])(
    'refuse une cle malformee sans requete %#',
    async (cleApi) => {
      const requete = vi.fn<typeof fetch>()
      await expect(lireYoutrust(choix, cleApi, requete)).rejects.toThrow()
      expect(requete).not.toHaveBeenCalled()
    },
  )
  it.each([204, 301, 400, 401, 403, 404, 429, 500, 504])(
    'refuse HTTP %i sans reprise automatique',
    async (status) => {
      const requete = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(status === 204 ? null : 'donnee privee', { status }))
      await expect(lireYoutrust(choix, cle, requete)).rejects.toThrow(
        /^Lecture Youtrust indisponible\.$/,
      )
      expect(requete).toHaveBeenCalledTimes(1)
    },
  )
  it.each([
    { ...objet, id: 'tx_autre' },
    { ...objet, status: undefined },
    { ...objet, status: 'unknown' },
    { ...objet, status: null },
    [objet],
    null,
  ])('refuse une reponse incoherente %#', async (valeur) => {
    await expect(
      lireYoutrust(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(json(valeur))),
    ).rejects.toThrow()
  })
  it('refuse une redirection suivie par un transport non conforme', async () => {
    const reponse = json()
    Object.defineProperty(reponse, 'redirected', { value: true })
    await expect(
      lireYoutrust(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
    ).rejects.toThrow()
  })
  it.each(['text/html', 'text/plain', ''])('refuse le type %s', async (type) => {
    await expect(
      lireYoutrust(
        choix,
        cle,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(JSON.stringify(objet), { headers: { 'content-type': type } }),
          ),
      ),
    ).rejects.toThrow()
  })
  it.each(['1048577', '-1', 'invalide'])(
    'refuse la taille annoncee %s avant lecture',
    async (taille) => {
      const annuler = vi.fn()
      const reponse = new Response(new ReadableStream({ cancel: annuler }), {
        headers: { 'content-type': 'application/json', 'content-length': taille },
      })
      await expect(
        lireYoutrust(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
      ).rejects.toThrow()
      expect(annuler).toHaveBeenCalled()
    },
  )
  it.each([undefined, '2'])(
    'borne un JSON valide meme sans taille annoncee fiable %#',
    async (taille) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (taille) headers['content-length'] = taille
      const reponse = new Response(
        JSON.stringify({ ...objet, commentaire: 'a'.repeat(1024 * 1024) }),
        { headers },
      )
      await expect(
        lireYoutrust(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
      ).rejects.toThrow()
    },
  )
  it('accepte un JSON valide a la limite exacte de taille', async () => {
    const minimum = JSON.stringify({ ...objet, commentaire: '' })
    const texte = JSON.stringify({
      ...objet,
      commentaire: 'a'.repeat(1024 * 1024 - Buffer.byteLength(minimum)),
    })
    expect(Buffer.byteLength(texte)).toBe(1024 * 1024)
    const reponse = new Response(texte, { headers: { 'content-type': 'application/json' } })
    expect(
      await lireYoutrust(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
    ).toEqual({ etat: 'done' })
  })
  it('refuse JSON invalide et UTF-8 corrompu', async () => {
    for (const octets of [Buffer.from('{'), Buffer.from([0xff])]) {
      await expect(
        lireYoutrust(
          choix,
          cle,
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(
              new Response(octets, { headers: { 'content-type': 'application/json' } }),
            ),
        ),
      ).rejects.toThrow()
    }
  })
  it('masque les details d erreur du transport', async () => {
    await expect(
      lireYoutrust(choix, cle, vi.fn<typeof fetch>().mockRejectedValue(new Error(`secret ${cle}`))),
    ).rejects.toThrow(/^Lecture Youtrust indisponible\.$/)
  })
  it('annule la lecture du corps lorsque le delai expire', async () => {
    const controle = new AbortController()
    const delai = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controle.signal)
    const annuler = vi.fn()
    const reponse = new Response(
      new ReadableStream({
        pull() {
          controle.abort()
        },
        cancel: annuler,
      }),
      { headers: { 'content-type': 'application/json' } },
    )
    await expect(
      lireYoutrust(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
    ).rejects.toThrow()
    expect(delai).toHaveBeenCalledWith(5000)
    expect(annuler).toHaveBeenCalled()
  })
})
