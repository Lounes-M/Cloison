import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  set: vi.fn(),
  resoudre: vi.fn(),
}))
vi.mock('@/lib/env', () => ({
  env: { supabaseJwtSecret: 'secret-fictif-de-plus-de-trente-deux-octets' },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (h.cookies.has(nom) ? { value: h.cookies.get(nom) } : undefined),
    set: h.set,
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECTION:${url}`)
  },
}))
vi.mock('@/lib/langue-espace', () => ({
  langueEspace: async () => 'fr',
  optionsCookieLangue: (langue: string) => ({ name: 'langue', value: langue }),
}))
vi.mock('@/lib/langue-preferee', () => ({ langueDossier: async () => null }))
vi.mock('@/lib/acces/session', () => ({
  NOM_COOKIE_CAPACITE: 'cloison_capacite',
  resoudreCapacite: h.resoudre,
}))

import { ouvrirAutreDossier, quitterMonDossier } from '@/lib/acces/action-porteur'
import { signerJeton, verifierSignature } from '@/lib/acces/jeton'
import { autresDossiers, cookiesDesAutres, rangerLesAutres } from '@/lib/acces/trousseau'

const demain = () => new Date(Date.now() + 86_400_000)
const jeton = (dossier: string, partie: 'locataire' | 'garant', jti = `${dossier}-${partie}`) =>
  signerJeton(dossier, partie, jti, demain())
const poses = () =>
  Object.fromEntries(
    h.set.mock.calls.map(([a, b, c]) =>
      typeof a === 'string' ? [a, { value: b, ...c }] : [a.name, a],
    ),
  )
const formulaire = (place: string) => {
  const f = new FormData()
  f.set('place', place)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  h.cookies.clear()
  h.resoudre.mockImplementation((j: string) => verifierSignature(j))
})

test('ouvrir un second lien garde le premier dossier dans le trousseau', async () => {
  const premier = await jeton('d1', 'garant')
  const second = (await verifierSignature(await jeton('d2', 'garant')))!
  expect(await rangerLesAutres(second, premier, [])).toEqual([premier])
})

test('rouvrir le lien d’un dossier déjà gardé ne le garde pas deux fois', async () => {
  const d1 = await jeton('d1', 'garant')
  const d1Reemis = (await verifierSignature(await jeton('d1', 'garant', 'nouveau-jti')))!
  const d2 = await jeton('d2', 'locataire')
  expect(await rangerLesAutres(d1Reemis, d2, [d1])).toEqual([d2])
})

test('un jeton illisible ou expiré quitte le trousseau, qui reste borné à trois', async () => {
  const actif = (await verifierSignature(await jeton('d0', 'garant')))!
  const expire = await signerJeton('d9', 'garant', 'x', new Date(Date.now() - 60_000))
  const valides = await Promise.all(['d1', 'd2', 'd3', 'd4'].map((d) => jeton(d, 'garant')))
  expect(await rangerLesAutres(actif, 'pas-un-jeton', [expire, ...valides])).toEqual(
    valides.slice(0, 3),
  )
})

test('le cadre ne lit que la place et le rôle des autres dossiers', async () => {
  const cookies = new Map([
    ['cloison_autre_1', await jeton('d1', 'locataire')],
    ['cloison_autre_2', 'falsifie'],
    ['cloison_autre_3', await jeton('d3', 'garant')],
  ])
  expect(await autresDossiers((nom) => cookies.get(nom))).toEqual([
    { place: 0, partie: 'locataire' },
    { place: 2, partie: 'garant' },
  ])
})

test('les places vides sont effacées, les autres restent HttpOnly', () => {
  const [garde, vide] = cookiesDesAutres(['jeton'], true)
  expect(garde).toMatchObject({
    name: 'cloison_autre_1',
    value: 'jeton',
    httpOnly: true,
    secure: true,
  })
  expect(garde!.maxAge).toBeGreaterThan(0)
  expect(vide).toMatchObject({ name: 'cloison_autre_2', value: '', maxAge: 0, httpOnly: true })
})

test('rouvrir un autre dossier échange les deux jetons après vérification', async () => {
  const actif = await jeton('d1', 'locataire')
  const autre = await jeton('d2', 'garant')
  h.cookies.set('cloison_capacite', actif).set('cloison_autre_1', autre)
  await expect(ouvrirAutreDossier(formulaire('0'))).rejects.toThrow('REDIRECTION:/garant')
  expect(h.resoudre).toHaveBeenCalledExactlyOnceWith(autre)
  expect(poses()).toMatchObject({
    cloison_capacite: { value: autre, httpOnly: true },
    cloison_autre_1: { value: actif },
    cloison_autre_2: { value: '', maxAge: 0 },
  })
})

test('un autre dossier dont le lien a été remplacé est retiré, sans toucher au dossier ouvert', async () => {
  h.cookies
    .set('cloison_capacite', await jeton('d1', 'locataire'))
    .set('cloison_autre_1', await jeton('d2', 'garant'))
  h.resoudre.mockResolvedValue(null)
  await expect(ouvrirAutreDossier(formulaire('0'))).rejects.toThrow('REDIRECTION:/lien-invalide')
  expect(poses()).toEqual({ cloison_autre_1: expect.objectContaining({ value: '', maxAge: 0 }) })
})

test.each(['7', '-1', 'abc', '1'])(
  'une place inconnue ou vide (%s) ne change rien',
  async (place) => {
    h.cookies.set('cloison_capacite', await jeton('d1', 'locataire'))
    await expect(ouvrirAutreDossier(formulaire(place))).rejects.toThrow(
      'REDIRECTION:/lien-invalide',
    )
    expect(h.set).not.toHaveBeenCalled()
    expect(h.resoudre).not.toHaveBeenCalled()
  },
)

test('quitter efface le dossier ouvert et tout le trousseau', async () => {
  await expect(quitterMonDossier()).rejects.toThrow('REDIRECTION:/demarrer')
  const p = poses()
  for (const nom of ['cloison_capacite', 'cloison_autre_1', 'cloison_autre_2', 'cloison_autre_3'])
    expect(p[nom]).toMatchObject({ value: '', maxAge: 0, httpOnly: true, path: '/' })
})
