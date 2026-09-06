import { format } from 'node:util'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const doubles = vi.hoisted(() => ({
  rpc: vi.fn(),
  ligne: vi.fn(),
  download: vi.fn(),
  otp: vi.fn(),
  echange: vi.fn(),
  agence: vi.fn(),
  signature: vi.fn(),
  ouvrir: vi.fn(),
  rasteriser: vi.fn(),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: vi.fn() }))
vi.mock('@/lib/acces/agence', () => ({ clientAgence: doubles.agence }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({ rpc: doubles.rpc }) }))
vi.mock('@/lib/acces/jeton', () => ({
  verifierSignature: doubles.signature,
  signerJeton: vi.fn(),
  DUREE_JETON: '1h',
}))
vi.mock('@/lib/coffre/cle-maitresse', () => ({ cleMaitresse: () => Buffer.alloc(32, 1) }))
vi.mock('@/lib/coffre/enveloppe', () => ({ ouvrir: doubles.ouvrir }))
vi.mock('@/lib/coffre/rasterisation', () => ({ rasteriser: doubles.rasteriser }))
import { envoyerLienDeConnexion } from '@/lib/agences/connexion'
import { GET } from '@/app/(agence)/connexion/verifie/route'
import { emettreLien, resoudreCapacite, ouvrirDossierAvecLien } from '@/lib/acces/session'
import { consommerDebit } from '@/lib/acces/debit'
import { inscrireAuJournal, lireCleScellee } from '@/lib/coffre/depot-supabase'
import { baseOuvertureSupabase } from '@/lib/coffre/ouverture-supabase'
import { ouvrirPiecePourLAgence } from '@/lib/coffre/ouverture'

const DOSSIER = '11111111-1111-4111-8111-111111111111'
const EMAIL = 'prive@example.invalid'
const CHEMIN = `${DOSSIER}/bulletin-confidentiel.pdf`
const SECRET = 'jeton-fictif-a-ne-pas-journaliser'
const erreur = { code: '42501', message: EMAIL, details: CHEMIN, hint: SECRET }
const panne = new Error(`${EMAIL} ${CHEMIN} ${SECRET}`)
const chaine = { select: vi.fn(), eq: vi.fn(), maybeSingle: doubles.ligne }
const db = {
  rpc: doubles.rpc,
  from: () => chaine,
  storage: { from: () => ({ download: doubles.download }) },
} as unknown as SupabaseClient
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  chaine.select.mockReturnValue(chaine)
  chaine.eq.mockReturnValue(chaine)
  doubles.rpc.mockResolvedValue({ data: null, error: erreur })
  doubles.ligne.mockResolvedValue({ data: null, error: erreur })
  doubles.download.mockResolvedValue({ data: null, error: erreur })
  doubles.agence.mockResolvedValue({
    auth: { signInWithOtp: doubles.otp, exchangeCodeForSession: doubles.echange },
  })
  doubles.signature.mockResolvedValue({ dossierId: DOSSIER, partie: 'garant', jti: SECRET })
  doubles.ouvrir.mockReturnValue(Buffer.from('fixture'))
})
afterEach(() => vi.restoreAllMocks())
function verifierTraces() {
  expect(console.error).toHaveBeenCalled()
  const traces = vi
    .mocked(console.error)
    .mock.calls.map((args) => format(...args))
    .join('\n')
  for (const prive of [DOSSIER, EMAIL, CHEMIN, SECRET]) expect(traces).not.toContain(prive)
}

for (const operation of ['emettre', 'resoudre', 'ouvrir'] as const) {
  test(`une erreur SQL de capacite ${operation} reste confidentielle et refuse l acces`, async () => {
    const resultat =
      operation === 'emettre'
        ? await emettreLien(DOSSIER, 'garant')
        : operation === 'resoudre'
          ? await resoudreCapacite(SECRET)
          : await ouvrirDossierAvecLien(EMAIL)
    expect(resultat).toBeNull()
    verifierTraces()
  })
}
test('une panne de debit ne divulgue pas la cible et refuse la tentative', async () => {
  expect(await consommerDebit(db, 'connexion_agence', EMAIL)).toBe(false)
  verifierTraces()
})
for (const operation of ['cle', 'journal', 'piece', 'telecharger'] as const) {
  test(`le coffre refuse ${operation} sans details fournisseur dans les journaux`, async () => {
    const base = baseOuvertureSupabase(db)
    const resultat =
      operation === 'cle'
        ? await lireCleScellee(db, DOSSIER)
        : operation === 'journal'
          ? await inscrireAuJournal(db, DOSSIER, 'piece_ouverte', SECRET)
          : operation === 'piece'
            ? await base.piece(SECRET)
            : await base.telecharger(CHEMIN)
    expect(resultat).toBe(operation === 'journal' ? false : null)
    verifierTraces()
  })
}
for (const exception of [false, true]) {
  test(`la connexion masque une erreur fournisseur, exception=${exception}`, async () => {
    doubles.rpc.mockResolvedValue({ data: true, error: null })
    if (exception) doubles.otp.mockRejectedValue(panne)
    else doubles.otp.mockResolvedValue({ error: erreur })
    const formulaire = new FormData()
    formulaire.set('courriel', EMAIL)
    expect(await envoyerLienDeConnexion({ statut: 'inactif' }, formulaire)).toEqual({
      statut: 'envoye',
    })
    verifierTraces()
  })
}
for (const origine of ['retour', 'exception', 'client'] as const) {
  test(`le retour Auth refuse ${origine} sans exposer l erreur ni le code`, async () => {
    if (origine === 'client') doubles.agence.mockRejectedValue(panne)
    else if (origine === 'exception') doubles.echange.mockRejectedValue(panne)
    else doubles.echange.mockResolvedValue({ error: erreur })
    const reponse = await GET(
      new NextRequest(`https://example.invalid/connexion/verifie?code=${SECRET}`),
    )
    expect(reponse.status).toBe(307)
    expect(reponse.headers.get('location')).toBe('https://example.invalid/connexion?echec=lien')
    verifierTraces()
  })
}
for (const etape of ['dechiffrement', 'rasterisation']) {
  test(`une panne de ${etape} ne publie ni original, ni chemin, ni erreur`, async () => {
    if (etape === 'dechiffrement')
      doubles.ouvrir.mockImplementation(() => {
        throw panne
      })
    else doubles.rasteriser.mockRejectedValue(panne)
    const resultat = await ouvrirPiecePourLAgence(
      {
        piece: async () => ({ dossierId: DOSSIER, chemin: CHEMIN, typeReel: 'application/pdf' }),
        journaliser: async () => true,
        cleScellee: async () => Buffer.from('cle'),
        telecharger: async () => Buffer.from('chiffre'),
      },
      SECRET,
      EMAIL,
    )
    expect(resultat.ouverte).toBe(false)
    expect(resultat).not.toHaveProperty('pdf')
    verifierTraces()
  })
}

test('un retour Auth sans code ne contacte pas le fournisseur', async () => {
  const reponse = await GET(new NextRequest('https://example.invalid/connexion/verifie'))
  expect(reponse.status).toBe(307)
  expect(reponse.headers.get('location')).toBe('https://example.invalid/connexion?echec=lien')
  expect(doubles.agence).not.toHaveBeenCalled()
  expect(console.error).not.toHaveBeenCalled()
})

test('un echange Auth reussi redirige vers l espace sans journaliser la session', async () => {
  doubles.echange.mockResolvedValue({ data: { session: { access_token: SECRET } }, error: null })
  const reponse = await GET(
    new NextRequest(`https://example.invalid/connexion/verifie?code=${SECRET}`),
  )
  expect(reponse.status).toBe(307)
  expect(reponse.headers.get('location')).toBe('https://example.invalid/espace')
  expect(doubles.echange).toHaveBeenCalledExactlyOnceWith(SECRET)
  expect(console.error).not.toHaveBeenCalled()
})
