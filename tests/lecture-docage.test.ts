import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lireDocage } from '../scripts/lire-docage.mjs'

const transaction = '11111111-1111-4111-8111-111111111111'
const choix = { environnement: 'sandbox', transaction }
const identifiants = { courriel: 'operateur@example.test', cle: 'cle_fictive_sans_acces' }
const basic = `Basic ${Buffer.from(`${identifiants.courriel}:${identifiants.cle}`).toString('base64')}`
const objet = { Id: transaction, GlobalStatus: 5, IsTest: true }
const json = (valeur: unknown = objet) =>
  new Response(JSON.stringify(valeur), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
afterEach(() => vi.restoreAllMocks())

describe('Lecture Docage bornee et sans mutation', () => {
  it('effectue un seul GET et ne restitue que l etat et le marquage de test', async () => {
    const requete = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        ...objet,
        TransactionMembers: [{ Email: 'prive@example.test', Phone: '+33600000000' }],
        Name: identifiants.cle,
      }),
    )
    const resultat = await lireDocage(choix, identifiants, requete)
    expect(resultat).toEqual({ etat: 'done', test: true })
    expect(JSON.stringify(resultat)).not.toContain('prive')
    expect(requete).toHaveBeenCalledExactlyOnceWith(
      `https://api.docage.com/Transactions/ById/${transaction}`,
      {
        method: 'GET',
        headers: { Authorization: basic, Accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    )
  })
  it.each([
    [0, 'draft'],
    [1, 'approval'],
    [2, 'paused'],
    [3, 'ongoing'],
    [4, 'ongoing'],
    [5, 'done'],
    [6, 'expired'],
    [7, 'declined'],
    [8, 'canceled'],
    ['Signed', 'done'],
    ['Refused', 'declined'],
    ['3', 'ongoing'],
  ])('traduit l etat %s en %s', async (statut, attendu) => {
    const requete = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ ...objet, GlobalStatus: statut }))
    expect((await lireDocage(choix, identifiants, requete)).etat).toBe(attendu)
  })
  it('accepte les cles en minuscules', async () => {
    const requete = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id: transaction, globalStatus: 3, isTest: false }))
    expect(
      await lireDocage({ ...choix, environnement: 'production' }, identifiants, requete),
    ).toEqual({ etat: 'ongoing', test: false })
  })
  it.each([
    ['sandbox', false],
    ['production', true],
  ])('refuse une transaction %s dont le marquage de test differe', async (env, isTest) => {
    const requete = vi.fn<typeof fetch>().mockResolvedValue(json({ ...objet, IsTest: isTest }))
    await expect(
      lireDocage({ ...choix, environnement: env }, identifiants, requete),
    ).rejects.toThrow(/^Lecture Docage indisponible\.$/)
  })
  it.each([
    { ...choix, environnement: 'test' },
    { ...choix, transaction: '../Transactions' },
    { ...choix, transaction: `${transaction}?x=1` },
    { ...choix, url: 'https://evil.example.test' },
  ])('refuse une selection invalide sans requete %#', async (selection) => {
    const requete = vi.fn<typeof fetch>()
    await expect(lireDocage(selection, identifiants, requete)).rejects.toThrow()
    expect(requete).not.toHaveBeenCalled()
  })
  it.each([
    { courriel: 'pas-une-adresse', cle: 'x' },
    { courriel: identifiants.courriel, cle: '' },
    { courriel: identifiants.courriel, cle: 'a\nb' },
    { courriel: identifiants.courriel, cle: 'a'.repeat(1025) },
  ])('refuse des identifiants malformes sans requete %#', async (id) => {
    const requete = vi.fn<typeof fetch>()
    await expect(lireDocage(choix, id, requete)).rejects.toThrow()
    expect(requete).not.toHaveBeenCalled()
  })
  it.each([204, 301, 401, 403, 404, 429, 500])('refuse HTTP %i sans reprise', async (status) => {
    const requete = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(status === 204 ? null : 'donnee privee', { status }))
    await expect(lireDocage(choix, identifiants, requete)).rejects.toThrow(
      /^Lecture Docage indisponible\.$/,
    )
    expect(requete).toHaveBeenCalledTimes(1)
  })
  it.each([
    { ...objet, Id: '22222222-2222-4222-8222-222222222222' },
    { ...objet, GlobalStatus: 9 },
    { ...objet, GlobalStatus: 'Inconnu' },
    { ...objet, GlobalStatus: null },
    { ...objet, IsTest: 'true' },
    [objet],
    null,
  ])('refuse une reponse incoherente %#', async (valeur) => {
    await expect(
      lireDocage(choix, identifiants, vi.fn<typeof fetch>().mockResolvedValue(json(valeur))),
    ).rejects.toThrow()
  })
  it('refuse un corps excessif meme sans taille annoncee', async () => {
    const reponse = new Response(JSON.stringify({ ...objet, Name: 'a'.repeat(1024 * 1024) }), {
      headers: { 'content-type': 'application/json' },
    })
    await expect(
      lireDocage(choix, identifiants, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
    ).rejects.toThrow()
  })
  it('refuse un type autre que JSON', async () => {
    const reponse = new Response(JSON.stringify(objet), {
      headers: { 'content-type': 'text/html' },
    })
    await expect(
      lireDocage(choix, identifiants, vi.fn<typeof fetch>().mockResolvedValue(reponse)),
    ).rejects.toThrow()
  })
  it('masque les details d erreur du transport', async () => {
    await expect(
      lireDocage(
        choix,
        identifiants,
        vi.fn<typeof fetch>().mockRejectedValue(new Error(`secret ${identifiants.cle}`)),
      ),
    ).rejects.toThrow(/^Lecture Docage indisponible\.$/)
  })
})

describe.skipIf(!['linux', 'darwin'].includes(process.platform))('CLI Docage', () => {
  let repertoire = ''
  afterEach(async () => {
    if (repertoire) await rm(repertoire, { recursive: true, force: true })
  })
  async function executer(mode: number) {
    repertoire = await mkdtemp(join(tmpdir(), 'cloison-docage-'))
    await writeFile(join(repertoire, 'acces'), `${identifiants.courriel}:${identifiants.cle}`, {
      mode,
    })
    // Aucun appel fournisseur : le CLI recoit un transport local impose au demarrage.
    await writeFile(
      join(repertoire, 'transport.mjs'),
      `globalThis.fetch = async (url, options) => {
        if (url !== 'https://api.docage.com/Transactions/ById/${transaction}'
            || options.method !== 'GET' || options.headers.Authorization !== '${basic}')
          throw new Error('Transport refuse');
        return new Response(JSON.stringify({Id:'${transaction}', GlobalStatus:3, IsTest:true,
          TransactionMembers:[{Email:'prive@example.test'}]}),
          {headers:{'content-type':'application/json'}});
      }`,
    )
    const fd = openSync(join(repertoire, 'acces'), 'r')
    try {
      return spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(join(repertoire, 'transport.mjs')).href,
          resolve('scripts/lire-docage.mjs'),
        ],
        {
          input: JSON.stringify(choix),
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe', fd],
          timeout: 10000,
        },
      )
    } finally {
      closeSync(fd)
    }
  }
  it('lit les acces sur le descripteur 3 et ne sort que l etat', async () => {
    const r = await executer(0o600)
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({ etat: 'ongoing', test: true })
    expect(r.stdout + r.stderr).not.toContain('prive')
    expect(r.stdout + r.stderr).not.toContain(identifiants.cle)
  })
  it('refuse un fichier d acces lisible par d autres', async () => {
    const r = await executer(0o644)
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).not.toContain(identifiants.cle)
  })
})
