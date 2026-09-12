import { afterEach, describe, expect, it, vi } from 'vitest'
import { lireUniversign } from '../scripts/lire-universign.mjs'

const choix = { environnement: 'alpha', transaction: 'tx_Fictive_123' }
const cle = 'apikey_fictive_sans_acces'
const objet = { object: 'transaction', id: choix.transaction, state: 'completed' }
const json = (valeur: unknown = objet) =>
  new Response(JSON.stringify(valeur), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
afterEach(() => vi.restoreAllMocks())

describe('Lecture Universign bornee et sans mutation', () => {
  it.each(['alpha', 'production'])(
    'effectue un seul GET sur %s et ne restitue que l etat',
    async (environnement) => {
      const requete = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          ...objet,
          participants: [{ email: 'prive@example.test', url: 'https://secret.example.test' }],
          metadata: { secret: cle },
        }),
      )
      expect(await lireUniversign({ ...choix, environnement }, cle, requete)).toEqual({
        etat: 'completed',
      })
      expect(requete).toHaveBeenCalledExactlyOnceWith(
        `https://api.${environnement === 'alpha' ? 'alpha.' : ''}universign.com/v1/transactions/${choix.transaction}`,
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
  it.each(['draft', 'started', 'paused', 'cancelled', 'expired', 'completed'])(
    'conserve l etat %s sans le transformer en preuve de signature',
    async (state) => {
      expect(
        await lireUniversign(
          choix,
          cle,
          vi.fn<typeof fetch>().mockResolvedValue(json({ ...objet, state })),
        ),
      ).toEqual({ etat: state })
    },
  )
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
    await expect(lireUniversign(selection, cle, requete)).rejects.toThrow(
      'Lecture Universign indisponible.',
    )
    expect(requete).not.toHaveBeenCalled()
  })
  it.each(['', 'a\nb', 'a\rb', ' a', 'é', 'a'.repeat(1025)])(
    'refuse une cle malformee sans requete %#',
    async (cleApi) => {
      const requete = vi.fn<typeof fetch>()
      await expect(lireUniversign(choix, cleApi, requete)).rejects.toThrow()
      expect(requete).not.toHaveBeenCalled()
    },
  )
  it.each([204, 301, 400, 401, 403, 404, 429, 500, 504])(
    'refuse HTTP %i sans reprise automatique',
    async (status) => {
      const requete = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(status === 204 ? null : 'donnee privee', { status }))
      await expect(lireUniversign(choix, cle, requete)).rejects.toThrow(
        /^Lecture Universign indisponible\.$/,
      )
      expect(requete).toHaveBeenCalledTimes(1)
    },
  )
  it.each([
    { ...objet, id: 'tx_autre' },
    { ...objet, object: 'file' },
    { ...objet, state: 'unknown' },
    { ...objet, state: null },
    [objet],
    null,
  ])('refuse une reponse incoherente %#', async (valeur) => {
    await expect(
      lireUniversign(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(json(valeur))),
    ).rejects.toThrow()
  })
  it('refuse une redirection suivie par un transport non conforme', async () => {
    const reponse = json()
    Object.defineProperty(reponse, 'redirected', { value: true })
    await expect(
      lireUniversign(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
    ).rejects.toThrow()
  })
  it.each(['text/html', 'text/plain', ''])('refuse le type %s', async (type) => {
    await expect(
      lireUniversign(
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
        lireUniversign(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
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
        lireUniversign(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
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
      await lireUniversign(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
    ).toEqual({ etat: 'completed' })
  })
  it('refuse JSON invalide et UTF-8 corrompu', async () => {
    for (const octets of [Buffer.from('{'), Buffer.from([0xff])]) {
      await expect(
        lireUniversign(
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
      lireUniversign(
        choix,
        cle,
        vi.fn<typeof fetch>().mockRejectedValue(new Error(`secret ${cle}`)),
      ),
    ).rejects.toThrow(/^Lecture Universign indisponible\.$/)
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
      lireUniversign(choix, cle, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
    ).rejects.toThrow()
    expect(delai).toHaveBeenCalledWith(5000)
    expect(annuler).toHaveBeenCalled()
  })
})
