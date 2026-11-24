import { randomBytes, randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { rendreEtatsApimo } from '@/lib/connecteurs/apimo/retours'
import { scellerIdentifiantsApimo } from '@/lib/connecteurs/apimo/secret'
import { messageDeSuivi } from '@/lib/connecteurs/apimo/suivi'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
import { FAUX_IDENTIFIANTS, demarrerFauxApimo, type FauxApimo } from './doublures/apimo'

/**
 * Le retour d'etat de bout en bout : la vraie base decide ce qui est du, le
 * vrai client ecrit sur un faux Apimo, la vraie base consigne l'issue.
 */
let db: PGlite, faux: FauxApimo, agence: string, admin: string, dossier: string, reference: string
beforeAll(async () => {
  process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
  delete process.env.CLE_MAITRESSE
})
/** Le client du role serveur : seules ses deux fonctions lui sont ouvertes. */
const serveur = () =>
  ({
    rpc: async (nom: string, params: Record<string, unknown>) => {
      await devenir(db, 'serveur')
      const cles = Object.keys(params)
      try {
        const { rows } = await db.query<{ r: unknown }>(
          `select public.${nom}(${cles.map((c, i) => `${c} => $${i + 1}`).join(',')}) r`,
          cles.map((c) => params[c]),
        )
        return { data: rows[0]!.r, error: null }
      } catch (erreur) {
        return { data: null, error: erreur }
      }
    },
  }) as unknown as SupabaseClient
beforeEach(async () => {
  await db.exec('begin')
  faux = await demarrerFauxApimo()
  agence = randomUUID()
  admin = randomUUID()
  dossier = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Essai','retour.invalid')", [
    agence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@retour.invalid',now())",
    [admin],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, admin],
  )
  reference = (
    await db.query<{ reference: string }>(
      "insert into dossiers(id,agence_id,email_locataire,locataire_nom,loyer_cents,statut) values($1,$2,'camille@example.invalid','Camille Durand',90000,'ouvert') returning reference",
      [dossier, agence],
    )
  ).rows[0]!.reference
  await devenir(db, 'authenticated', admin)
  await db.query('select configurer_apimo($1,$2,$3,true)', [
    FAUX_IDENTIFIANTS.fournisseur,
    FAUX_IDENTIFIANTS.agenceApimo,
    scellerIdentifiantsApimo({ agence, ...FAUX_IDENTIFIANTS }),
  ])
  await db.query("select lier_dossier_apimo($1,'12','B-2026/014')", [dossier])
})
afterEach(async () => {
  await faux.fermer()
  await db.exec('rollback')
  await redevenirProprietaire(db)
  vi.restoreAllMocks()
})
const cycle = (budget = AbortSignal.timeout(10_000)) =>
  rendreEtatsApimo(serveur(), budget, faux.transport)
async function lien() {
  await redevenirProprietaire(db)
  return (await db.query('select etat_envoye,etat_tente,incertain,tentatives from liens_apimo'))
    .rows[0]
}
async function avancer(statut?: string) {
  await redevenirProprietaire(db)
  if (statut) await db.query('update dossiers set statut=$1 where id=$2', [statut, dossier])
  await db.query("update liens_apimo set prochaine_tentative=clock_timestamp()-interval '1 hour'")
}

test('inscrit l etat sur la fiche du bien, puis se tait tant que rien ne change', async () => {
  expect(await cycle()).toEqual({ traites: 1, echecs: 0 })
  expect(faux.origines).toEqual(['https://api.apimo.pro'])
  expect(faux.recues).toEqual([
    {
      methode: 'POST',
      chemin: '/agencies/777/actions',
      autorisation: `Basic ${Buffer.from('4242:jeton-fictif-0123456789').toString('base64')}`,
      corps: {
        type: 10,
        property: 12,
        comment: `Cloison, dossier de garantie ${reference} (bail B-2026/014) : à compléter.`,
      },
    },
  ])
  expect(await lien()).toMatchObject({ etat_envoye: 'a_completer', incertain: false })
  await avancer()
  expect(await cycle()).toEqual({ traites: 0, echecs: 0 })
  expect(faux.recues).toHaveLength(1)
})

test('rien de la personne ne quitte Cloison', async () => {
  for (const statut of [undefined, 'complet', 'transmis', 'signe']) {
    await avancer(statut)
    await cycle()
  }
  expect(faux.recues).toHaveLength(4)
  const envoye = JSON.stringify(faux.recues)
  expect(envoye).not.toMatch(/camille|Durand|example\.invalid|90000|900/i)
  expect(faux.recues.map((r) => (r.corps as { comment: string }).comment.split(' : ')[1])).toEqual([
    'à compléter.',
    'prêt à examiner.',
    'en cours de décision.',
    'acte signé.',
  ])
})

test('un refus net d Apimo se retente au cycle suivant, pas avant', async () => {
  faux.prochaine({ statut: 403 })
  const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(await cycle()).toEqual({ traites: 0, echecs: 1 })
  expect(await lien()).toMatchObject({ etat_envoye: null, incertain: false, tentatives: 1 })
  expect(await cycle()).toEqual({ traites: 0, echecs: 0 })
  await avancer()
  expect(await cycle()).toEqual({ traites: 1, echecs: 0 })
  expect(faux.recues).toHaveLength(2)
  // Le journal ne porte ni reference, ni jeton, ni identifiant.
  expect(JSON.stringify(erreurs.mock.calls)).not.toMatch(
    new RegExp(`${reference.replace(/[+/]/g, '.')}|jeton-fictif|4242|777`),
  )
})

test('une connexion coupee en route laisse l etat en suspens, sans rejeu', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  faux.prochaine({ coupure: true })
  expect(await cycle()).toEqual({ traites: 0, echecs: 1 })
  expect(await lien()).toMatchObject({
    etat_envoye: null,
    etat_tente: 'a_completer',
    incertain: true,
  })
  await avancer()
  expect(await cycle()).toEqual({ traites: 0, echecs: 0 })
  expect(faux.recues).toHaveLength(1)
  // Le dossier avance : le nouvel etat part, l'ancien n'est jamais renvoye.
  await avancer('complet')
  expect(await cycle()).toEqual({ traites: 1, echecs: 0 })
  expect((faux.recues[1]!.corps as { comment: string }).comment).toContain('prêt à examiner')
})

test('un scelle qui ne s ouvre plus n appelle pas Apimo', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
  expect(await cycle()).toEqual({ traites: 0, echecs: 1 })
  expect(faux.recues).toHaveLength(0)
  expect(await lien()).toMatchObject({ etat_envoye: null, incertain: false })
})

test('un budget epuise n envoie rien et rend la main au cycle suivant', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(await cycle(AbortSignal.abort())).toEqual({ traites: 0, echecs: 1 })
  expect(faux.recues).toHaveLength(0)
  expect(await lien()).toMatchObject({ incertain: false, tentatives: 1 })
})

test('sans le choix de l agence, rien ne part', async () => {
  await devenir(db, 'authenticated', admin)
  await db.query('select regler_retour_apimo(false)')
  expect(await cycle()).toEqual({ traites: 0, echecs: 0 })
  await devenir(db, 'authenticated', admin)
  await db.query('select regler_retour_apimo(true)')
  await db.query('select retirer_apimo()')
  expect(await cycle()).toEqual({ traites: 0, echecs: 0 })
  expect(faux.recues).toHaveLength(0)
})

test('une reservation indisponible leve au lieu de rendre un bilan vide', async () => {
  const panne = { rpc: async () => ({ data: null, error: { message: 'prive' } }) }
  await expect(
    rendreEtatsApimo(panne as unknown as SupabaseClient, AbortSignal.timeout(1000), faux.transport),
  ).rejects.toThrow('Reservation des retours indisponible')
  const etrange = { rpc: async () => ({ data: { pas: 'une liste' }, error: null }) }
  await expect(
    rendreEtatsApimo(
      etrange as unknown as SupabaseClient,
      AbortSignal.timeout(1000),
      faux.transport,
    ),
  ).rejects.toThrow()
})

test('une ligne illisible compte comme un echec et ne part pas', async () => {
  const rpc = vi.fn(async () => ({ data: [{ dossier: 'pas-un-uuid' }], error: null }))
  expect(
    await rendreEtatsApimo(
      { rpc } as unknown as SupabaseClient,
      AbortSignal.timeout(1000),
      faux.transport,
    ),
  ).toEqual({ traites: 0, echecs: 1 })
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(faux.recues).toHaveLength(0)
})

test.each([
  ['a_completer', null, 'Cloison, dossier de garantie AbC+/123= : à compléter.'],
  ['clos', 'B-1', 'Cloison, dossier de garantie AbC+/123= (bail B-1) : clos.'],
] as const)('le message de suivi pour %s', (etat, bail, attendu) => {
  expect(messageDeSuivi('AbC+/123=', etat, bail)).toBe(attendu)
  expect(() => messageDeSuivi('ref\navec saut', etat, bail)).toThrow()
})
