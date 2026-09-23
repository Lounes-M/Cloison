import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, afterEach, expect, test, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire } from './base'
import { sceller } from '@/lib/coffre/enveloppe'
import { scellerMaitresse } from '@/lib/coffre/rotation-maitresse'
import { archiverFichier, traiterActe, type BaseActes } from '@/lib/signature/parcours'
import {
  empreintePdf,
  ouvrirFichierActe,
  scellerFichierActe,
  type FichierActe,
} from '@/lib/signature/archive-format'
let db: PGlite, dossier: string, membre: string, id: string, cle: Buffer
let objets: Map<string, Buffer>
const pdf = Buffer.from('%PDF-1.7\nDocument de recette fictif\n%%EOF')
const distante = randomUUID(),
  document = randomUUID(),
  signataire = randomUUID()
const hex = (b: Buffer) => `\\x${b.toString('hex')}`
const signal = () => AbortSignal.timeout(15000)
async function rpc(nom: string, args: Record<string, unknown> = {}) {
  if (!/^[a-z_]+$/.test(nom) || Object.keys(args).some((k) => !/^[a-z_]+$/.test(k)))
    throw new Error('RPC invalide')
  const noms = Object.keys(args)
    .map((k, i) => `${k} => $${i + 1}`)
    .join(',')
  return (
    await db.query<{ r: unknown }>(
      `select ${nom}(${noms}) r`,
      Object.values(args).map((v) =>
        typeof v === 'string' && v.startsWith('\\x') ? Buffer.from(v.slice(2), 'hex') : v,
      ),
    )
  ).rows[0]!.r
}
const serveur = {
  rpc: async (n: string, a: Record<string, unknown>) => ({ data: await rpc(n, a), error: null }),
} as unknown as BaseActes
const stockage = async (f: FichierActe) => ({
  deposer: async (b: Buffer) => {
    if (!objets.has(f.id)) objets.set(f.id, Buffer.from(b))
    await db.exec('reset role')
    await db.query(
      "insert into storage.objects(bucket_id,name) values('actes',$1) on conflict do nothing",
      [`${f.acte_id}/${f.id}`],
    )
    await devenir(db, 'serveur')
    return false // L'ecriture a reussi, mais sa reponse est perdue.
  },
  lire: async () => {
    const b = objets.get(f.id)
    if (!b) throw new Error('Absent')
    return Buffer.from(b)
  },
})
function fournisseur() {
  return {
    creer: vi.fn(async () => ({ id: distante, status: 'draft' })),
    ajouterDocument: vi.fn(async () => ({ id: document })),
    ajouterSignataire: vi.fn(async () => ({ id: signataire })),
    activer: vi.fn(async () => ({ id: distante, status: 'ongoing' })),
    recupererPieces: vi.fn(async () => ({ acte: { pdf }, preuves: [{ signataire, pdf }] })),
  } as unknown as Parameters<typeof traiterActe>[3]
}
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  vi.stubEnv('CLE_MAITRESSE', Buffer.alloc(32, 7).toString('base64'))
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', '')
  vi.stubEnv('CLES_MAITRESSES_LECTURE', '')
  await db.exec('begin')
  await db.exec(
    readFileSync('supabase/essais/lecture-ocr.sql', 'utf8').split(
      'set local role authenticated;',
    )[0]!,
  )
  const r = (
    await db.query<{ d: string; u: string }>(
      "select current_setting('cloison.ocr_dossier') d,current_setting('cloison.ocr_membre') u",
    )
  ).rows[0]!
  dossier = r.d
  membre = r.u
  id = randomUUID()
  cle = randomBytes(32)
  objets = new Map()
  await db.exec(
    "update agences set siren='123456789',carte_pro='CPI recette'; update agences set statut='verifiee',verifiee_le=now()",
  )
  await db.query(
    "insert into engagements(dossier_id,couvre,montant_max_cents,jusqu_au,solidaire,nom,prenom,mention,mention_saisie_le) values($1,'loyer',100000,'2030-01-01',true,'Fictif','Essai',$2,now())",
    [dossier, 'Mention personnelle de recette uniquement, sans engagement reel.'],
  )
  await db.query(
    "update dossiers set statut='transmis',email_garant='garant@example.invalid' where id=$1",
    [dossier],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
  cle.fill(0)
  vi.unstubAllEnvs()
})
async function preparer(mode = 'production') {
  await devenir(db, 'authenticated', membre)
  const contexte = {
    version: 1,
    id,
    dossier,
    prenom: 'Essai',
    nom: 'Fictif',
    email: 'garant@example.invalid',
    telephone: '+33600000000',
    page: 1,
    x: 0,
    y: 0,
  }
  return rpc('preparer_acte_signature', {
    le_id: id,
    le_dossier: dossier,
    le_mode: mode,
    le_modele: 'recette-v1',
    la_version: 1,
    empreinte: empreintePdf(pdf),
    cle: hex(scellerMaitresse(cle)),
    contexte: hex(sceller(Buffer.from(JSON.stringify(contexte)), cle)),
    expiration: new Date(Date.now() + 2 * 86400000).toISOString(),
    conservation: new Date(Date.now() + 365 * 86400000).toISOString(),
  })
}
async function deposer(mode = 'production') {
  expect(await preparer(mode)).toBe(id)
  await devenir(db, 'serveur')
  await archiverFichier(serveur, id, 'projet', pdf, cle, signal(), stockage)
}
async function valider(accepter = true) {
  await devenirPorteur(db, dossier, 'garant')
  return rpc('valider_acte_signature', { le_id: id, empreinte: empreintePdf(pdf), accepter })
}
async function demarrer(mode = 'production') {
  await deposer(mode)
  expect(await valider()).toBe(true)
  await devenir(db, 'serveur')
  const f = fournisseur()
  await traiterActe(serveur, id, mode as 'production' | 'sandbox', f, signal(), stockage)
  return f
}
async function etatDistant(etat = 'done', mode = 'production') {
  const evenement = randomUUID()
  const notification = {
    le_mode: mode,
    le_evenement: evenement,
    la_reference: distante,
    le_statut: etat,
    cree: new Date().toISOString(),
  }
  // Les noms de parametres publics sont verifies dans le catalogue de la base.
  const noms = (
    await db.query<{ proargnames: string[] }>(
      "select proargnames from pg_proc where proname='enregistrer_evenement_signature'",
    )
  ).rows[0]!.proargnames
  const vals = Object.values(notification)
  const args = Object.fromEntries(noms.map((n, i) => [n, vals[i]]))
  const premier = await rpc('enregistrer_evenement_signature', args)
  expect(await rpc('enregistrer_evenement_signature', args)).toEqual(premier)
  const bail = (
    await db.query<{ id: string; bail: string; revision: number }>(
      'select * from reserver_signatures_a_rapprocher($1)',
      [mode],
    )
  ).rows[0]!
  expect(
    (
      await db.query<{ r: boolean }>(
        'select confirmer_rapprochement_signature($1,$2,$3,$4,$5,$6,$7) r',
        [id, mode, bail.bail, bail.revision, distante, id, etat],
      )
    ).rows[0]!.r,
  ).toBe(true)
}
test.each(['production', 'sandbox'])(
  'parcours complet %s avec upload perdu, notification double et publication repetee',
  async (mode) => {
    const f = await demarrer(mode)
    expect(f.creer).toHaveBeenCalledTimes(1)
    await etatDistant('done', mode)
    await traiterActe(serveur, id, mode as 'production' | 'sandbox', f, signal(), stockage)
    await traiterActe(serveur, id, mode as 'production' | 'sandbox', f, signal(), stockage)
    await redevenirProprietaire(db)
    expect((await db.query('select etape from actes_signature')).rows).toEqual([
      { etape: 'archive' },
    ])
    expect((await db.query('select * from factures_actes')).rows).toHaveLength(
      mode === 'production' ? 1 : 0,
    )
    expect((await db.query('select * from fichiers_signature where confirme')).rows).toHaveLength(3)
    expect(
      (await db.query("select * from journal_signatures where action='archive'")).rows,
    ).toHaveLength(1)
  },
)
test.each(['declined', 'expired', 'canceled', 'rejected'])(
  'la terminaison %s ne publie ni ne facture',
  async (etat) => {
    const f = await demarrer()
    await etatDistant(etat)
    await traiterActe(serveur, id, 'production', f, signal(), stockage)
    expect(f.recupererPieces).not.toHaveBeenCalled()
    await redevenirProprietaire(db)
    expect((await db.query('select * from factures_actes')).rows).toHaveLength(0)
  },
)
test('le refus du garant interdit tout appel fournisseur', async () => {
  await deposer()
  expect(await valider(false)).toBe(true)
  await devenir(db, 'serveur')
  const f = fournisseur()
  await traiterActe(serveur, id, 'production', f, signal(), stockage)
  expect(f.creer).not.toHaveBeenCalled()
})
test.each(['creer', 'ajouterDocument', 'ajouterSignataire', 'activer'] as const)(
  'une reponse %s perdue ne rejoue jamais le POST',
  async (methode) => {
    await deposer()
    await valider()
    await devenir(db, 'serveur')
    const f = fournisseur()
    vi.mocked(f[methode]).mockRejectedValueOnce(new Error('Reseau interrompu apres effet distant'))
    await expect(traiterActe(serveur, id, 'production', f, signal(), stockage)).rejects.toThrow()
    await expect(traiterActe(serveur, id, 'production', f, signal(), stockage)).rejects.toThrow(
      'Operation non reservee',
    )
    expect(f[methode]).toHaveBeenCalledTimes(1)
  },
)
test('le locataire ne peut ni consulter ni valider le projet du garant', async () => {
  await deposer()
  await devenirPorteur(db, dossier, 'locataire')
  expect(await rpc('lire_acte_signature', { le_id: id })).toBeNull()
  expect(
    await rpc('valider_acte_signature', {
      le_id: id,
      empreinte: empreintePdf(pdf),
      accepter: true,
    }),
  ).toBe(false)
})
test('une empreinte differente et une validation repetee sont refusees', async () => {
  await deposer()
  await devenirPorteur(db, dossier, 'garant')
  expect(
    await rpc('valider_acte_signature', { le_id: id, empreinte: 'a'.repeat(64), accepter: true }),
  ).toBe(false)
  expect(await valider()).toBe(true)
  expect(await valider()).toBe(false)
})
test('un projet expire efface sa cle et attend avant la suppression physique', async () => {
  await deposer()
  await redevenirProprietaire(db)
  await db.exec("update actes_signature set expire_signature=now()-interval '1 day'")
  expect(await valider()).toBe(false)
  await devenir(db, 'serveur')
  expect(await rpc('expirer_archives_signature')).toBe(1)
  expect((await db.query('select * from fichiers_archives_a_supprimer()')).rows).toHaveLength(0)
  await redevenirProprietaire(db)
  expect((await db.query('select cle_scellee,contexte_chiffre from actes_signature')).rows).toEqual(
    [{ cle_scellee: null, contexte_chiffre: null }],
  )
})
test('le chiffrement authentifie le fichier, la nature et les octets', () => {
  const f: FichierActe = {
    id: randomUUID(),
    acte_id: id,
    nature: 'acte',
    taille: pdf.length,
    empreinte: empreintePdf(pdf),
    nonce: hex(randomBytes(12)),
    confirme: false,
  }
  const chiffre = scellerFichierActe(pdf, cle, f)
  expect(ouvrirFichierActe(chiffre, cle, f)).toEqual(pdf)
  expect(() => ouvrirFichierActe(chiffre, cle, { ...f, nature: 'preuve' })).toThrow()
  expect(() => ouvrirFichierActe(chiffre, cle, { ...f, acte_id: randomUUID() })).toThrow()
  const altere = Buffer.from(chiffre)
  altere[0] = altere[0]! ^ 1
  expect(() => ouvrirFichierActe(altere, cle, f)).toThrow()
  expect(() => scellerFichierActe(Buffer.from('%PDF-different'), cle, f)).toThrow()
})

test('l archive signee survit a la purge des justificatifs et reste reservee a son agence', async () => {
  const f = await demarrer()
  await etatDistant()
  await traiterActe(serveur, id, 'production', f, signal(), stockage)
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '2 days',expire_le=now()-interval '1 second' where id=$1",
    [dossier],
  )
  await devenir(db, 'serveur')
  expect(await rpc('expirer_archives_signature')).toBe(0)
  await devenir(db, 'authenticated', membre)
  expect(await rpc('lire_acte_signature', { le_id: id })).not.toBeNull()
  await devenir(db, 'authenticated', randomUUID())
  expect(await rpc('lire_acte_signature', { le_id: id })).toBeNull()
  await devenirPorteur(db, dossier, 'garant')
  expect(await rpc('lire_acte_signature', { le_id: id })).toBeNull()
})
test('une notification pendant l archivage empeche la publication du snapshot precedent', async () => {
  const f = await demarrer()
  await etatDistant()
  const original = f.recupererPieces
  vi.mocked(f.recupererPieces).mockImplementationOnce(async (...args) => {
    const pieces = await original(...args)
    await db.exec('reset role')
    await db.exec('update demandes_signature set revision=revision+1')
    await devenir(db, 'serveur')
    return pieces
  })
  await expect(traiterActe(serveur, id, 'production', f, signal(), stockage)).rejects.toThrow(
    'Archive non publiee',
  )
  await redevenirProprietaire(db)
  expect((await db.query('select * from factures_actes')).rows).toHaveLength(0)
})
test('la perte du depot de preuve est reprenable sans second envoi fournisseur ni facturation prematuree', async () => {
  const f = await demarrer()
  await etatDistant()
  const interrompu: typeof stockage = async (ref) => {
    const s = await stockage(ref)
    if (ref.nature === 'preuve')
      return {
        ...s,
        lire: async () => {
          throw new Error('Reseau')
        },
      }
    return s
  }
  await expect(traiterActe(serveur, id, 'production', f, signal(), interrompu)).rejects.toThrow(
    'Reseau',
  )
  await redevenirProprietaire(db)
  expect((await db.query('select * from factures_actes')).rows).toHaveLength(0)
  await devenir(db, 'serveur')
  await traiterActe(serveur, id, 'production', f, signal(), stockage)
  expect(f.creer).toHaveBeenCalledTimes(1)
  await redevenirProprietaire(db)
  expect((await db.query('select * from factures_actes')).rows).toHaveLength(1)
})
test.each([
  'anon',
  'authenticated',
  'porteur_lien',
  'depot_piece',
  'service_role',
  'archive_signature',
])('le role %s ne peut pas publier ni facturer', async (role) => {
  await deposer()
  await db.exec(`set role ${role}`)
  await db.exec('savepoint refus')
  await expect(rpc('publier_archive_signature', { le_id: id, la_revision: 0 })).rejects.toThrow(
    /permission denied/,
  )
  await db.exec('rollback to refus')
  await expect(db.query('select * from actes_signature')).rejects.toThrow(/permission denied/)
  await db.exec('rollback to refus')
})
test('le jeton storage ne lit que le fichier reserve et ne peut pas le remplacer', async () => {
  await deposer()
  await redevenirProprietaire(db)
  const f = (await db.query<{ id: string }>('select id from fichiers_signature')).rows[0]!
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: 'archive_signature', fichier_signature: f.id }),
  ])
  await db.exec('set role archive_signature')
  expect((await db.query('select name from storage.objects')).rows).toEqual([
    { name: `${id}/${f.id}` },
  ])
  expect(
    (await db.query("delete from storage.objects where bucket_id='actes' returning id")).rows,
  ).toHaveLength(0)
  await db.exec('savepoint refus')
  await expect(
    db.query("insert into storage.objects(bucket_id,name) values('actes',$1)", [
      `${id}/${randomUUID()}`,
    ]),
  ).rejects.toThrow(/row-level security/)
  await db.exec('rollback to refus')
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: 'archive_signature', fichier_signature: randomUUID() }),
  ])
  expect((await db.query('select name from storage.objects')).rows).toHaveLength(0)
})
async function facturePrete() {
  const f = await demarrer()
  await etatDistant()
  await traiterActe(serveur, id, 'production', f, signal(), stockage)
  await devenir(db, 'authenticated', membre)
  const facture = (await db.query<{ id: string }>('select id from factures_actes')).rows[0]!.id
  const r = (await rpc('reserver_reglement_acte', { la_facture: facture })) as {
    id: string
    montant: number
    tarif: string
  }
  return { facture, ...r }
}
async function confirmerPaiement(
  r: { id: string; facture: string; montant: number; tarif: string },
  autres: Record<string, unknown> = {},
) {
  await devenir(db, 'serveur')
  return rpc('rapprocher_reglement_acte', {
    le_id: r.id,
    la_facture: r.facture,
    la_session: 'cs_fixture',
    le_paiement: 'pi_fixture',
    montant: r.montant,
    devise: 'eur',
    tarif: r.tarif,
    statut: 'paye',
    rembourse: 0,
    conteste: false,
    ...autres,
  })
}
test('le reglement reserve est unique, un doublon ne change pas la date de paiement', async () => {
  const r = await facturePrete()
  expect(await rpc('reserver_reglement_acte', { la_facture: r.facture })).toMatchObject({
    id: r.id,
  })
  await devenir(db, 'serveur')
  expect(await rpc('rattacher_reglement_acte', { le_id: r.id, la_session: 'cs_fixture' })).toBe(
    true,
  )
  expect(await confirmerPaiement(r)).toBe(true)
  await redevenirProprietaire(db)
  const avant = (await db.query('select paye_le from factures_actes')).rows
  expect(await confirmerPaiement(r)).toBe(true)
  await redevenirProprietaire(db)
  expect((await db.query('select paye_le from factures_actes')).rows).toEqual(avant)
  await devenir(db, 'authenticated', membre)
  expect(await rpc('reserver_reglement_acte', { la_facture: r.facture })).toBeNull()
})
test.each([{ montant: 1 }, { devise: 'usd' }, { tarif: 'autre' }, { la_session: 'cs_autre' }])(
  'un paiement incoherent ne regle rien %j',
  async (modif) => {
    const r = await facturePrete()
    await devenir(db, 'serveur')
    await rpc('rattacher_reglement_acte', { le_id: r.id, la_session: 'cs_fixture' })
    expect(await confirmerPaiement(r, modif)).toBe(false)
    await redevenirProprietaire(db)
    expect((await db.query('select paye_le from factures_actes')).rows).toEqual([{ paye_le: null }])
    expect((await db.query('select anomalie from reglements_actes')).rows).toEqual([
      { anomalie: true },
    ])
  },
)
test('un echec laisse le paiement ouvert, seule une expiration confirmee autorise une nouvelle tentative', async () => {
  const r = await facturePrete()
  await devenir(db, 'serveur')
  await rpc('rattacher_reglement_acte', { le_id: r.id, la_session: 'cs_fixture' })
  expect(await confirmerPaiement(r, { statut: 'ouvert', le_paiement: null })).toBe(true)
  await devenir(db, 'authenticated', membre)
  expect(await rpc('reserver_reglement_acte', { la_facture: r.facture })).toMatchObject({
    id: r.id,
  })
  expect(await confirmerPaiement(r, { statut: 'expire', le_paiement: null })).toBe(true)
  await devenir(db, 'authenticated', membre)
  expect(await rpc('reserver_reglement_acte', { la_facture: r.facture })).not.toMatchObject({
    id: r.id,
  })
})
test('un remboursement et un litige ne deviennent jamais un second paiement', async () => {
  const r = await facturePrete()
  await devenir(db, 'serveur')
  await rpc('rattacher_reglement_acte', { le_id: r.id, la_session: 'cs_fixture' })
  await confirmerPaiement(r)
  expect(await confirmerPaiement(r, { rembourse: 100 })).toBe(true)
  expect(await confirmerPaiement(r, { conteste: true })).toBe(true)
  expect(await confirmerPaiement(r)).toBe(true)
  await redevenirProprietaire(db)
  expect((await db.query('select etat,rembourse_cents from reglements_actes')).rows).toEqual([
    { etat: 'litige', rembourse_cents: 100 },
  ])
  expect((await db.query('select * from factures_actes')).rows).toHaveLength(1)
})

test('un dossier ne se refuse pas pendant une signature active mais se libere apres refus fournisseur', async () => {
  await demarrer()
  await redevenirProprietaire(db)
  await db.exec('savepoint refus')
  await expect(
    db.query("update dossiers set statut='refuse' where id=$1", [dossier]),
  ).rejects.toThrow('Un acte est en cours')
  await db.exec('rollback to refus')
  await devenir(db, 'serveur')
  await etatDistant('declined')
  await redevenirProprietaire(db)
  await db.query("update dossiers set statut='refuse' where id=$1", [dossier])
  expect((await db.query('select statut from dossiers where id=$1', [dossier])).rows).toEqual([
    { statut: 'refuse' },
  ])
})

test('la pagination des reglements suit les dates, pas l ordre aleatoire des UUID', async () => {
  const r = await facturePrete()
  await redevenirProprietaire(db)
  const agence = (
    await db.query<{ agence_id: string }>('select agence_id from factures_actes where id=$1', [
      r.facture,
    ])
  ).rows[0]!.agence_id
  const recent = '00000000-0000-4000-8000-000000000001',
    ancien = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  await db.query(
    "insert into factures_actes(id,agence_id,montant_cents,cree_le) values($1,$2,2900,now()+interval '1 minute'),($3,$2,2900,now()-interval '1 day')",
    [recent, agence, ancien],
  )
  await devenir(db, 'authenticated', membre)
  expect(((await rpc('factures_de_mon_agence')) as { id: string }[]).map((f) => f.id)).toEqual([
    recent,
    r.facture,
    ancien,
  ])
  expect(
    ((await rpc('factures_de_mon_agence', { avant: r.facture })) as { id: string }[]).map(
      (f) => f.id,
    ),
  ).toEqual([ancien])
  expect(await rpc('factures_de_mon_agence', { avant: randomUUID() })).toEqual([])
})

test('un projet valide jamais envoye est detruit a echeance sans conserver sa cle', async () => {
  await deposer()
  await valider()
  await redevenirProprietaire(db)
  await db.exec("update actes_signature set expire_signature=now()-interval '1 second'")
  await devenir(db, 'serveur')
  expect(await rpc('expirer_archives_signature')).toBe(1)
  await redevenirProprietaire(db)
  expect((await db.query('select cle_scellee from actes_signature')).rows).toEqual([
    { cle_scellee: null },
  ])
})
test('une creation incertaine expiree conserve sa cle et declenche un rapprochement', async () => {
  await deposer()
  await valider()
  await devenir(db, 'serveur')
  expect(
    await rpc('reserver_operation_acte', { le_id: id, etape_attendue: 'valide' }),
  ).not.toBeNull()
  await redevenirProprietaire(db)
  await db.exec("update actes_signature set expire_signature=now()-interval '1 second'")
  await devenir(db, 'serveur')
  expect(await rpc('expirer_archives_signature')).toBe(0)
  expect(await rpc('operations_actes_a_examiner')).toBe(1)
})

test('une agence suspendue ne peut faire valider un nouveau projet', async () => {
  await deposer()
  await redevenirProprietaire(db)
  await db.exec("update agences set statut='suspendue'")
  expect(await valider()).toBe(false)
})
test('la suspension apres consentement interdit toute mutation fournisseur', async () => {
  await deposer()
  await valider()
  await redevenirProprietaire(db)
  await db.exec("update agences set statut='suspendue'")
  await devenir(db, 'serveur')
  const f = fournisseur()
  expect((await db.query("select * from actes_a_traiter('production')")).rows).toHaveLength(0)
  await expect(traiterActe(serveur, id, 'production', f, signal(), stockage)).rejects.toThrow(
    'Operation non reservee',
  )
  expect(f.creer).not.toHaveBeenCalled()
})
test('une suspension entre deux etapes empeche le depot du document suivant', async () => {
  await deposer()
  await valider()
  await devenir(db, 'serveur')
  const f = fournisseur()
  vi.mocked(f.creer).mockImplementationOnce(async () => {
    await redevenirProprietaire(db)
    await db.exec("update agences set statut='suspendue'")
    await devenir(db, 'serveur')
    return { id: distante, status: 'draft' }
  })
  await expect(traiterActe(serveur, id, 'production', f, signal(), stockage)).rejects.toThrow(
    'Operation non reservee',
  )
  expect(f.creer).toHaveBeenCalledTimes(1)
  expect(f.ajouterDocument).not.toHaveBeenCalled()
})
